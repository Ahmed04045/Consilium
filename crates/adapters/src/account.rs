use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;
#[derive(Clone, Serialize, Deserialize)]
pub struct AccountConfig {
    pub project_url: String,
    pub public_key: String,
}
impl AccountConfig {
    pub fn validate(&self) -> Result<()> {
        let u = url::Url::parse(&self.project_url)?;
        if u.scheme() != "https"
            || !u.host_str().is_some_and(|h| h.ends_with(".supabase.co"))
            || u.path() != "/"
            || u.query().is_some()
            || u.fragment().is_some()
            || !u.username().is_empty()
            || u.password().is_some()
            || u.port().is_some()
        {
            bail!("Use your https://PROJECT.supabase.co project URL");
        }
        if !self.public_key.starts_with("sb_publishable_") {
            bail!("Use a Supabase publishable key (sb_publishable_), never a secret or service-role key");
        }
        Ok(())
    }
    fn entry(&self) -> Result<keyring::Entry> {
        self.validate()?;
        Ok(keyring::Entry::new(
            "ConsiliumNext",
            &format!("account-{}", self.project_url.trim_end_matches('/')),
        )?)
    }
    pub fn connected(&self) -> bool {
        self.entry()
            .ok()
            .and_then(|e| e.get_password().ok())
            .is_some()
    }
    pub fn email(&self) -> Option<String> {
        self.entry()
            .ok()
            .and_then(|e| e.get_password().ok())
            .and_then(|s| serde_json::from_str::<Value>(&s).ok())
            .and_then(|v| v["email"].as_str().map(String::from))
    }
    pub fn disconnect(&self) -> Result<()> {
        let _ = self.entry()?.delete_credential();
        Ok(())
    }
}
static AUTH_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
pub async fn call(
    c: &AccountConfig,
    path: &str,
    token: Option<&str>,
    body: Option<Value>,
) -> Result<Value> {
    c.validate()?;
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(30))
        .build()?;
    let url = format!("{}{}", c.project_url.trim_end_matches('/'), path);
    let mut request = if let Some(body) = body {
        client.post(url).json(&body)
    } else {
        client.get(url)
    }
    .header("apikey", &c.public_key);
    if let Some(token) = token {
        request = request.bearer_auth(token)
    }
    let response = request.send().await.context("Could not reach Supabase")?;
    if !response.status().is_success() {
        bail!("Supabase returned HTTP {}. Check credentials, email confirmation, and the Consilium migration. A sync conflict requires downloading the latest snapshot first.",response.status().as_u16());
    }
    Ok(response.json().await.context("Invalid Supabase response")?)
}
pub async fn login(c: &AccountConfig, email: &str, password: &str, signup: bool) -> Result<Value> {
    let _lock = AUTH_LOCK.lock().await;
    let path = if signup {
        "/auth/v1/signup"
    } else {
        "/auth/v1/token?grant_type=password"
    };
    let v = call(
        c,
        path,
        None,
        Some(json!({"email":email,"password":password})),
    )
    .await?;
    if let Some(refresh) = v["refresh_token"].as_str() {
        c.entry()?.set_password(
            &json!({"refresh_token":refresh,"email":v["user"]["email"],"user_id":v["user"]["id"]})
                .to_string(),
        )?;
        Ok(json!({"connected":true}))
    } else {
        Ok(
            json!({"connected":false,"message":"Check your email to confirm your account, then sign in."}),
        )
    }
}
pub async fn session(c: &AccountConfig) -> Result<(String, String)> {
    let _lock = AUTH_LOCK.lock().await;
    let entry = c.entry()?;
    let saved: Value = serde_json::from_str(&entry.get_password().context("Sign in to sync")?)?;
    let refresh = saved["refresh_token"].as_str().context("Sign in again")?;
    let v = call(
        c,
        "/auth/v1/token?grant_type=refresh_token",
        None,
        Some(json!({"refresh_token":refresh})),
    )
    .await?;
    let refresh = v["refresh_token"]
        .as_str()
        .context("Missing refresh token")?;
    entry.set_password(
        &json!({"refresh_token":refresh,"email":v["user"]["email"],"user_id":v["user"]["id"]})
            .to_string(),
    )?;
    Ok((
        v["access_token"]
            .as_str()
            .context("Missing access token")?
            .into(),
        v["user"]["id"]
            .as_str()
            .context("Missing account ID")?
            .into(),
    ))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_public_host_and_publishable_key() {
        let good = AccountConfig {
            project_url: "https://example.supabase.co".into(),
            public_key: "sb_publishable_test".into(),
        };
        assert!(good.validate().is_ok());
        assert!(AccountConfig {
            project_url: "http://example.supabase.co".into(),
            ..good.clone()
        }
        .validate()
        .is_err());
        assert!(AccountConfig {
            public_key: "sb_secret_bad".into(),
            ..good
        }
        .validate()
        .is_err());
    }
}
