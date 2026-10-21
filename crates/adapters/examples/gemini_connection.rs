//! Explicit live diagnostic: uses the selected Windows credential and synthetic text only.
//! Run manually with: cargo run -p consilium-adapters --example gemini_connection -- <model-id>
use consilium_adapters::Provider;
use consilium_domain::Settings;
use serde_json::json;

#[tokio::main]
async fn main() {
    let model = std::env::args().nth(1).unwrap_or_default();
    let streaming = std::env::args().nth(2).as_deref() == Some("--stream");
    let model_info = std::env::args().nth(2).as_deref() == Some("--model-info");
    if model.is_empty() {
        eprintln!("Pass the exact Gemini model ID. No API key belongs on the command line.");
        std::process::exit(2);
    }
    let diagnostic = async {
        let provider = Provider::new(Settings {
            provider: "gemini".into(),
            chat_model: model.clone(),
            context_tokens: 8192,
            ..Settings::default()
        })?;
        if model_info {
            let list = provider.models().await?;
            let found = list["models"].as_array().and_then(|items| {
                items
                    .iter()
                    .find(|item| item["name"].as_str() == Some(&format!("models/{model}")))
            });
            let info = found.ok_or_else(|| {
                anyhow::anyhow!("Selected model not in the first model-list page")
            })?;
            println!(
                "{}",
                json!({"name":info["name"],"inputTokenLimit":info["inputTokenLimit"],"outputTokenLimit":info["outputTokenLimit"],"supportedGenerationMethods":info["supportedGenerationMethods"]})
            );
            return Ok::<_, anyhow::Error>(());
        }
        if streaming {
            let chunks = std::sync::Mutex::new(String::new());
            let answer = provider
                .stream_chat("Answer briefly.", "Say hello.", |chunk| {
                    chunks.lock().unwrap().push_str(chunk);
                })
                .await?;
            anyhow::ensure!(
                answer == *chunks.lock().unwrap() && !answer.trim().is_empty(),
                "Streaming response did not match delivered chunks"
            );
            return Ok::<_, anyhow::Error>(());
        }
        let response = provider.generate(
            "Return only JSON.", "Return {\"ok\":true}",
            Some(&json!({"type":"object","additionalProperties":false,"required":["ok"],"properties":{"ok":{"type":"boolean"}}}))
        ).await?;
        let parsed: serde_json::Value = serde_json::from_str(&response)?;
        anyhow::ensure!(
            parsed["ok"] == true,
            "The model did not return the test object"
        );
        Ok::<_, anyhow::Error>(())
    };
    let result = tokio::time::timeout(std::time::Duration::from_secs(45), diagnostic)
        .await
        .unwrap_or_else(|_| Err(anyhow::anyhow!("Diagnostic timed out before a usable response. This does not identify an API-key or request-format error.")));
    match result {
        Ok(()) => println!(
            "Gemini {} check passed.",
            if model_info {
                "model metadata"
            } else if streaming {
                "synthetic streaming"
            } else {
                "synthetic structured connection"
            }
        ),
        Err(error) => {
            if let Some(network) = error.downcast_ref::<reqwest::Error>() {
                eprintln!("Transport failure (timeout={}, connection={}). No HTTP rejection was received.", network.is_timeout(), network.is_connect());
            } else {
                eprintln!("{error}");
            }
            std::process::exit(1);
        }
    }
}
