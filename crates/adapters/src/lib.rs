use anyhow::{bail, Context, Result};
pub mod account;
pub mod keys;
pub fn cloud(provider: &str) -> bool {
    matches!(provider, "gemini" | "openrouter")
}
pub fn set_model_key(provider: &str, key: &str) -> Result<()> {
    if !cloud(provider) {
        bail!("Choose a cloud provider");
    }
    let entry = keyring::Entry::new("Consilium", &format!("model-{provider}"))?;
    if key.is_empty() {
        let _ = entry.delete_credential();
    } else {
        entry.set_password(key)?;
    }
    Ok(())
}
pub fn has_model_key(provider: &str) -> bool {
    keyring::Entry::new("Consilium", &format!("model-{provider}"))
        .ok()
        .and_then(|e| e.get_password().ok())
        .is_some()
}
use consilium_domain::*;
use serde_json::{json, Value};
use std::time::Duration;
use url::Url;

#[derive(Clone)]
pub struct Provider {
    pub settings: Settings,
    client: reqwest::Client,
}
pub fn local_endpoint(input: &str) -> Result<String> {
    let url = Url::parse(input)?;
    if url.scheme() != "http"
        || !matches!(
            url.host_str(),
            Some("localhost" | "127.0.0.1" | "[::1]" | "::1")
        )
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        bail!(
            "Inference requires an HTTP loopback endpoint without credentials or query parameters"
        );
    }
    Ok(input.trim_end_matches('/').to_string())
}
impl Provider {
    async fn checked_json(&self, mut response: reqwest::Response) -> Result<Value> {
        let status = response.status();
        if status.is_success() {
            return Ok(response.json().await?);
        }
        // Only expose the bounded error message, never raw responses or request logs.
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await? {
            if bytes.len() + chunk.len() > 16_384 {
                break;
            }
            bytes.extend_from_slice(&chunk);
        }
        let value: Value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
        let key = keys::selected(&self.settings.provider).ok();
        let detail = provider_error_detail(&value, key.as_deref());
        bail!(
            "{} HTTP {}: {}",
            self.settings.provider,
            status.as_u16(),
            detail
        );
    }
    pub async fn stream_chat<F>(&self, system: &str, prompt: &str, on_chunk: F) -> Result<String>
    where
        F: Fn(&str) + Send + Sync,
    {
        if self.settings.chat_model.is_empty() {
            bail!("Choose a chat model in Settings");
        }
        if system.len() + prompt.len() + 2560 > self.settings.context_tokens {
            bail!("Request exceeds the configured conservative context budget");
        }
        self.fingerprint(&self.settings.chat_model).await?;
        let messages = json!([{"role":"system","content":system},{"role":"user","content":prompt}]);
        let (path, body) = if self.settings.provider == "ollama" {
            (
                "/api/chat",
                json!({"model":self.settings.chat_model,"messages":messages,"stream":true,"options":{"num_ctx":self.settings.context_tokens,"num_predict":2048}}),
            )
        } else {
            (
                "/chat/completions",
                json!({"model":self.settings.chat_model,"messages":messages,"stream":true,"max_tokens":2048}),
            )
        };
        let mut response = self
            .authorize(self.client.post(self.url(path)))?
            .json(&body)
            .send()
            .await?
            .error_for_status()?;
        let mut pending = Vec::new();
        let mut answer = String::new();
        while let Some(bytes) = response.chunk().await? {
            pending.extend_from_slice(&bytes);
            if pending.len() > 1_000_000 {
                bail!("Provider stream frame exceeded the size limit");
            }
            while let Some(end) = pending.iter().position(|b| *b == b'\n') {
                let bytes: Vec<_> = pending.drain(..=end).collect();
                let line = std::str::from_utf8(&bytes)?.trim();
                let line = if self.settings.provider != "ollama" {
                    let Some(data) = line.strip_prefix("data:") else {
                        continue;
                    };
                    data.trim()
                } else {
                    line
                };
                if line.is_empty() || line == "[DONE]" {
                    continue;
                }
                let value: Value = serde_json::from_str(line)?;
                if value.get("error").is_some() {
                    bail!("Local model stream failed");
                }
                if value["done_reason"] == "length"
                    || value["choices"][0]["finish_reason"] == "length"
                {
                    bail!("Response truncated. Shorten the question or increase output capacity.");
                }
                let fragment = if self.settings.provider == "ollama" {
                    value["message"]["content"].as_str()
                } else {
                    value["choices"][0]["delta"]["content"].as_str()
                };
                if let Some(fragment) = fragment {
                    answer.push_str(fragment);
                    on_chunk(fragment);
                }
            }
        }
        if !pending.iter().all(u8::is_ascii_whitespace) {
            bail!("Provider ended with an incomplete stream frame");
        }
        if answer.trim().is_empty() {
            bail!("The local model returned no answer");
        }
        Ok(answer)
    }
    pub fn new(mut settings: Settings) -> Result<Self> {
        settings.endpoint = match settings.provider.as_str() {
            "gemini" => "https://generativelanguage.googleapis.com/v1beta/openai".into(),
            "openrouter" => "https://openrouter.ai/api/v1".into(),
            _ => local_endpoint(&settings.endpoint)?,
        };
        if !matches!(
            settings.provider.as_str(),
            "ollama" | "openai" | "gemini" | "openrouter"
        ) {
            bail!("Unsupported provider");
        }
        if !(2048..=131072).contains(&settings.context_tokens) {
            bail!("Context window must be between 2048 and 131072 tokens");
        }
        if !cloud(&settings.provider)
            && (settings.chat_model.to_lowercase().contains("cloud")
                || settings.embedding_model.to_lowercase().contains("cloud"))
        {
            bail!("Select a locally executing model");
        }
        Ok(Self {
            settings,
            client: reqwest::Client::builder()
                .no_proxy()
                .redirect(reqwest::redirect::Policy::none())
                .connect_timeout(Duration::from_secs(5))
                .timeout(Duration::from_secs(120))
                .build()?,
        })
    }
    fn authorize(&self, request: reqwest::RequestBuilder) -> Result<reqwest::RequestBuilder> {
        if cloud(&self.settings.provider) {
            let key = keys::selected(&self.settings.provider)?;
            Ok(request.bearer_auth(key))
        } else {
            Ok(request)
        }
    }
    fn url(&self, path: &str) -> String {
        format!("{}{path}", self.settings.endpoint)
    }
    pub async fn models(&self) -> Result<Value> {
        let path = if self.settings.provider == "ollama" {
            "/api/tags"
        } else {
            "/models"
        };
        Ok(self
            .authorize(self.client.get(self.url(path)))?
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?)
    }
    pub async fn fingerprint(&self, model: &str) -> Result<Option<String>> {
        if self.settings.provider != "ollama" {
            return Ok(None);
        }
        let result = self
            .client
            .post(self.url("/api/show"))
            .json(&json!({"model":model}))
            .send()
            .await?
            .error_for_status()?
            .json::<Value>()
            .await?;
        if result.get("remote_host").is_some() || result.get("remote_model").is_some() {
            bail!("Remote model execution is disabled");
        }
        let models = self.models().await?;
        Ok(models["models"]
            .as_array()
            .and_then(|a| {
                a.iter().find(|m| {
                    m["name"].as_str() == Some(model)
                        || m["name"].as_str() == Some(&format!("{model}:latest"))
                })
            })
            .and_then(|m| m["digest"].as_str())
            .map(String::from))
    }
    pub async fn embed(&self, model: &str, text: &str) -> Result<Vec<f32>> {
        if cloud(&self.settings.provider) {
            bail!("Cloud embedding uploads are disabled");
        }
        let (path, body) = if self.settings.provider == "ollama" {
            (
                "/api/embed",
                json!({"model":model,"input":text,"truncate":false}),
            )
        } else {
            ("/embeddings", json!({"model":model,"input":text}))
        };
        let value: Value = self
            .authorize(self.client.post(self.url(path)))?
            .json(&body)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        let vector = if self.settings.provider == "ollama" {
            &value["embeddings"][0]
        } else {
            &value["data"][0]["embedding"]
        };
        let vector: Vec<f32> = serde_json::from_value(vector.clone())
            .context("Provider returned an invalid embedding")?;
        normalize(&vector, vector.len())
    }
    pub async fn identity(&self) -> Result<EmbeddingIdentity> {
        if self.settings.embedding_model.trim().is_empty() {
            bail!("Choose an embedding model");
        }
        let fingerprint = self.fingerprint(&self.settings.embedding_model).await?;
        if cloud(&self.settings.provider) {
            bail!("Cloud embedding uploads are disabled. Leave the embedding model empty.");
        }
        let vector = self
            .embed(
                &self.settings.embedding_model,
                "Consilium embedding capability probe",
            )
            .await?;
        Ok(EmbeddingIdentity {
            provider_kind: self.settings.provider.clone(),
            endpoint_identity: self.settings.endpoint.clone(),
            model_name: self.settings.embedding_model.clone(),
            model_fingerprint: fingerprint,
            dimensions: vector.len(),
            distance_metric: "cosine".into(),
            normalization_version: 1,
            chunker_version: 1,
        })
    }
    pub async fn generate(
        &self,
        system: &str,
        prompt: &str,
        schema: Option<&Value>,
    ) -> Result<String> {
        if self.settings.chat_model.trim().is_empty() {
            bail!("Choose a chat model in Settings");
        }
        let input_bytes = system.len() + prompt.len() + schema.map_or(0, |s| s.to_string().len());
        let output_limit = if schema.is_some_and(|s| s["properties"]["tasks"]["maxItems"] == 64) {
            (self.settings.context_tokens / 2).min(12288)
        } else if cloud(&self.settings.provider) {
            4096
        } else {
            2048
        };
        let output_limit = output_limit.min(
            self.settings
                .context_tokens
                .saturating_sub(input_bytes + 512),
        );
        if output_limit < 1024 {
            bail!("This request exceeds the conservative context budget. Shorten active context or increase the configured model window.");
        }
        self.fingerprint(&self.settings.chat_model).await?;
        let messages = json!([{"role":"system","content":system},{"role":"user","content":prompt}]);
        let (path, mut body) = if self.settings.provider == "ollama" {
            (
                "/api/chat",
                json!({"model":self.settings.chat_model,"messages":messages,"stream":false,"options":{"temperature":0.2,"num_ctx":self.settings.context_tokens,"num_predict":2048}}),
            )
        } else {
            (
                "/chat/completions",
                json!({"model":self.settings.chat_model,"messages":messages,"stream":false,"temperature":0.2,"max_tokens":2048}),
            )
        };
        if self.settings.provider == "ollama" {
            body["options"]["num_predict"] = json!(output_limit);
        } else {
            body["max_tokens"] = json!(output_limit);
        }
        if let Some(schema) = schema {
            if self.settings.provider == "ollama" {
                body["format"] = schema.clone();
            } else {
                body["response_format"] = json!({"type":"json_schema","json_schema":{"name":"consilium_response","strict":true,"schema":schema}});
            }
        }
        let response = self
            .authorize(self.client.post(self.url(path)))?
            .json(&body)
            .send()
            .await?;
        let value = self.checked_json(response).await?;
        if value["choices"][0]["finish_reason"] == "length" || value["done_reason"] == "length" {
            bail!("Model output was truncated; try a smaller request");
        }
        let content = if self.settings.provider == "ollama" {
            value["message"]["content"].as_str()
        } else {
            value["choices"][0]["message"]["content"].as_str()
        };
        Ok(content.context("No model response")?.to_owned())
    }
}

fn provider_error_detail(value: &Value, key: Option<&str>) -> String {
    let mut message = value["error"]["message"].as_str()
        .unwrap_or("Provider rejected the request. Check the saved model ID, API key and provider account.")
        .to_owned();
    if let Some(key) = key.filter(|k| !k.is_empty()) {
        message = message.replace(key, "[redacted]");
    }
    message
        .chars()
        .filter(|c| !c.is_control() || *c == ' ')
        .take(800)
        .collect()
}

pub fn set_youtube_key(key: &str) -> Result<()> {
    let entry = keyring::Entry::new("Consilium", "youtube-api-key")?;
    if key.is_empty() {
        let _ = entry.delete_credential();
    } else {
        entry.set_password(key)?;
    }
    Ok(())
}
pub fn public_url(input: &str) -> Result<Url> {
    let url = Url::parse(input)?;
    if !matches!(url.scheme(), "https" | "http")
        || !url.username().is_empty()
        || url.password().is_some()
    {
        bail!("Use a public HTTP(S) URL without credentials");
    }
    let host = url.host_str().context("URL needs a host")?;
    if host == "localhost" || host.ends_with(".local") || host.parse::<std::net::IpAddr>().is_ok() {
        bail!("Use a public hostname");
    }
    Ok(url)
}
fn online_client() -> Result<reqwest::Client> {
    Ok(reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(20))
        .build()?)
}
pub async fn discover(kind: &str, query: &str) -> Result<Vec<Resource>> {
    if query.trim().is_empty() || query.len() > 2000 {
        bail!("Enter a short query or feed URL");
    }
    let client = online_client()?;
    if kind == "youtube" {
        let key = keyring::Entry::new("Consilium", "youtube-api-key")?
            .get_password()
            .context("Add a YouTube API key in Settings")?;
        let value: Value = client
            .get("https://www.googleapis.com/youtube/v3/search")
            .query(&[
                ("part", "snippet"),
                ("type", "video"),
                ("maxResults", "8"),
                ("q", query),
                ("key", &key),
            ])
            .send()
            .await
            .map_err(|_| anyhow::anyhow!("Discovery request failed"))?
            .error_for_status()
            .map_err(|_| anyhow::anyhow!("Discovery unavailable: check API key or quota"))?
            .json()
            .await?;
        Ok(value["items"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|item| {
                let video = item["id"]["videoId"].as_str()?;
                Some(Resource {
                    id: id(),
                    title: item["snippet"]["title"].as_str().unwrap_or("Video").into(),
                    url: format!("https://www.youtube.com/watch?v={video}"),
                    kind: "video".into(),
                    provenance: "YouTube metadata; content not watched".into(),
                })
            })
            .collect())
    } else if kind == "feed" {
        let url = public_url(query)?;
        let response = client.get(url).send().await?.error_for_status()?;
        if response.content_length().unwrap_or(0) > 2_000_000 {
            bail!("Feed is too large");
        }
        let bytes = response.bytes().await?;
        if bytes.len() > 2_000_000 {
            bail!("Feed is too large");
        }
        let feed = feed_rs::parser::parse(&bytes[..])?;
        Ok(feed
            .entries
            .iter()
            .take(20)
            .filter_map(|entry| {
                let link = entry.links.first()?;
                public_url(&link.href).ok()?;
                Some(Resource {
                    id: id(),
                    title: entry
                        .title
                        .as_ref()
                        .map(|t| t.content.clone())
                        .unwrap_or_else(|| "Reading".into()),
                    url: link.href.clone(),
                    kind: "reading".into(),
                    provenance: "Feed metadata; full text not imported".into(),
                })
            })
            .collect())
    } else {
        bail!("Unknown discovery provider")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reject_remote_inference() {
        for url in [
            "https://api.example.com/v1",
            "http://127.0.0.1.evil.test",
            "http://user@localhost:1234",
            "http://192.168.1.1:1234",
        ] {
            assert!(local_endpoint(url).is_err());
        }
        assert!(local_endpoint("http://127.0.0.1:1234/v1").is_ok());
    }
}

#[cfg(test)]
mod cloud_tests {
    use super::*;
    #[test]
    fn provider_errors_are_bounded_and_redact_credentials() {
        let value =
            json!({"error":{"message":"API key test-secret is invalid"},"request":"private"});
        let detail = provider_error_detail(&value, Some("test-secret"));
        assert_eq!(detail, "API key [redacted] is invalid");
        assert!(!detail.contains("private"));
        assert_eq!(
            provider_error_detail(&json!({"error":{"message":"x".repeat(1000)}}), None).len(),
            800
        );
        assert!(provider_error_detail(&Value::Null, None).contains("saved model ID"));
    }
    #[test]
    fn cloud_endpoints_cannot_be_overridden() {
        for (name, host) in [
            (
                "gemini",
                "https://generativelanguage.googleapis.com/v1beta/openai",
            ),
            ("openrouter", "https://openrouter.ai/api/v1"),
        ] {
            let p = Provider::new(Settings {
                provider: name.into(),
                endpoint: "https://evil.example".into(),
                ..Settings::default()
            })
            .unwrap();
            assert_eq!(p.settings.endpoint, host);
        }
    }
    #[tokio::test]
    async fn no_cloud_embedding_uploads() {
        let p = Provider::new(Settings {
            provider: "gemini".into(),
            ..Settings::default()
        })
        .unwrap();
        assert!(p
            .embed("any", "private text")
            .await
            .unwrap_err()
            .to_string()
            .contains("disabled"));
    }
}
