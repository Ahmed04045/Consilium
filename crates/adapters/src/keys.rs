use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Mutex;

static LOCK: Mutex<()> = Mutex::new(());
#[derive(Default, Serialize, Deserialize)]
struct Registry {
    selected: String,
    keys: Vec<SavedKey>,
}
#[derive(Serialize, Deserialize)]
struct SavedKey {
    id: String,
    name: String,
    secret: String,
}
fn entry(provider: &str) -> Result<keyring::Entry> {
    if !super::cloud(provider) {
        bail!("Choose Gemini or OpenRouter");
    }
    Ok(keyring::Entry::new(
        "Consilium",
        &format!("named-keys-{provider}"),
    )?)
}
fn load(provider: &str) -> Result<Registry> {
    match entry(provider)?.get_password() {
        Ok(s) => Ok(serde_json::from_str(&s)?),
        Err(keyring::Error::NoEntry) => {
            let mut r = Registry::default();
            if let Ok(secret) =
                keyring::Entry::new("Consilium", &format!("model-{provider}"))?.get_password()
            {
                r.selected = "legacy".into();
                r.keys.push(SavedKey {
                    id: "legacy".into(),
                    name: "Existing key".into(),
                    secret,
                });
            }
            Ok(r)
        }
        Err(e) => Err(e.into()),
    }
}
pub fn selected(provider: &str) -> Result<String> {
    let r = load(provider)?;
    r.keys
        .into_iter()
        .find(|k| k.id == r.selected)
        .map(|k| k.secret)
        .context("Choose a saved API key in Settings")
}
pub fn manage(provider: &str, action: &str, payload: &Value) -> Result<Value> {
    let _guard = LOCK
        .lock()
        .map_err(|_| anyhow::anyhow!("Key store unavailable"))?;
    let mut r = load(provider)?;
    let id = payload["id"].as_str().unwrap_or("");
    match action {
        "save" => {
            let name = payload["name"].as_str().unwrap_or("").trim();
            let secret = payload["key"].as_str().unwrap_or("").trim();
            if name.is_empty()
                || name.len() > 80
                || secret.is_empty()
                || secret.len() > 1000
                || r.keys.len() >= 10
            {
                bail!("Provide a name and API key; keep at most 10 keys per provider");
            }
            let id = consilium_domain::id();
            r.keys.push(SavedKey {
                id: id.clone(),
                name: name.into(),
                secret: secret.into(),
            });
            r.selected = id;
        }
        "select" => {
            if !r.keys.iter().any(|k| k.id == id) {
                bail!("Saved key not found");
            }
            r.selected = id.into();
        }
        "delete" => {
            r.keys.retain(|k| k.id != id);
            if r.selected == id {
                r.selected = String::new();
            }
        }
        "list" => {}
        _ => bail!("Unknown key action"),
    }
    if action != "list" {
        let serialized = serde_json::to_string(&r)?;
        let e = entry(provider)?;
        e.set_password(&serialized)
            .context("Could not save key; your input has been kept")?;
        if e.get_password()? != serialized {
            bail!("Key storage verification failed");
        }
    }
    Ok(
        json!({"selected":r.selected,"keys":r.keys.iter().map(|k| json!({"id":k.id,"name":k.name})).collect::<Vec<_>>()}),
    )
}
