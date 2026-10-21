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
#[derive(Serialize, Deserialize)]
struct Manifest {
    version: u32,
    selected: String,
    ids: Vec<String>,
}
trait Backend {
    fn read(&self, name: &str) -> Result<Option<String>>;
    fn write(&self, name: &str, value: &str) -> Result<()>;
    fn remove(&self, name: &str) -> Result<()>;
}
struct WindowsBackend<'a>(&'a str);
impl WindowsBackend<'_> {
    fn entry(&self, name: &str) -> Result<keyring::Entry> {
        let account = match name {
            "registry" => format!("named-keys-{}", self.0),
            "legacy" => format!("model-{}", self.0),
            _ => format!("named-secret-{}-{name}", self.0),
        };
        Ok(keyring::Entry::new("Consilium", &account)?)
    }
}
impl Backend for WindowsBackend<'_> {
    fn read(&self, name: &str) -> Result<Option<String>> {
        match self.entry(name)?.get_password() {
            Ok(v) => Ok(Some(v)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }
    fn write(&self, name: &str, value: &str) -> Result<()> {
        self.entry(name)?.set_password(value)?;
        Ok(())
    }
    fn remove(&self, name: &str) -> Result<()> {
        match self.entry(name)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.into()),
        }
    }
}
fn load(backend: &impl Backend) -> Result<Registry> {
    if let Some(raw) = backend.read("registry")? {
        let value: Value = serde_json::from_str(&raw)?;
        if value.get("version").is_some() {
            let manifest: Manifest = serde_json::from_value(value)?;
            if manifest.version != 2 || manifest.ids.len() > 10 {
                bail!("Unsupported key registry");
            }
            let mut keys = Vec::new();
            for id in manifest.ids {
                let raw = backend
                    .read(&format!("key-{id}"))?
                    .context("Saved key is missing; save it again")?;
                let key: SavedKey = serde_json::from_str(&raw)?;
                if key.id != id {
                    bail!("Invalid key entry");
                }
                keys.push(key);
            }
            return Ok(Registry {
                selected: manifest.selected,
                keys,
            });
        }
        return Ok(serde_json::from_value(value)?);
    }
    let mut r = Registry::default();
    if let Some(secret) = backend.read("legacy")? {
        r.selected = "legacy".into();
        r.keys.push(SavedKey {
            id: "legacy".into(),
            name: "Existing key".into(),
            secret,
        });
    }
    Ok(r)
}
fn verified_write(backend: &impl Backend, name: &str, value: &str) -> Result<()> {
    // Windows stores passwords as UTF-16 in a maximum 2,560-byte blob.
    if value.encode_utf16().count() * 2 > 2560 {
        bail!("This key entry exceeds Windows credential capacity; shorten the key name");
    }
    backend
        .write(name, value)
        .context("Could not save key; your input has been kept")?;
    if backend.read(name)?.as_deref() != Some(value) {
        bail!("Key storage verification failed");
    }
    Ok(())
}
fn persist(backend: &impl Backend, old: &Registry, next: &Registry) -> Result<()> {
    // Immutable IDs: write individual keys first, then switch the compact manifest.
    // A failed key write cannot replace the previous registry/selection.
    for key in &next.keys {
        let name = format!("key-{}", key.id);
        let raw = serde_json::to_string(key)?;
        if backend.read(&name)?.as_deref() != Some(&raw) {
            verified_write(backend, &name, &raw)?;
        }
    }
    let manifest = Manifest {
        version: 2,
        selected: next.selected.clone(),
        ids: next.keys.iter().map(|k| k.id.clone()).collect(),
    };
    verified_write(backend, "registry", &serde_json::to_string(&manifest)?)?;
    for key in &old.keys {
        if !next.keys.iter().any(|k| k.id == key.id) {
            backend.remove(&format!("key-{}", key.id))?;
        }
    }
    // Retire the legacy copy only after the new manifest is durable.
    backend.remove("legacy")?;
    Ok(())
}
fn validate_provider(provider: &str) -> Result<()> {
    if !super::cloud(provider) {
        bail!("Choose Gemini or OpenRouter");
    }
    Ok(())
}
pub fn selected(provider: &str) -> Result<String> {
    validate_provider(provider)?;
    let _guard = LOCK
        .lock()
        .map_err(|_| anyhow::anyhow!("Key store unavailable"))?;
    let r = load(&WindowsBackend(provider))?;
    r.keys
        .into_iter()
        .find(|k| k.id == r.selected)
        .map(|k| k.secret)
        .context("Choose a saved API key in Settings")
}
pub fn manage(provider: &str, action: &str, payload: &Value) -> Result<Value> {
    validate_provider(provider)?;
    let _guard = LOCK
        .lock()
        .map_err(|_| anyhow::anyhow!("Key store unavailable"))?;
    manage_with(&WindowsBackend(provider), action, payload)
}
fn manage_with(backend: &impl Backend, action: &str, payload: &Value) -> Result<Value> {
    let old = load(backend)?;
    let mut r: Registry = serde_json::from_value(serde_json::to_value(&old)?)?;
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
        persist(backend, &old, &r)?;
    }
    Ok(
        json!({"selected":r.selected,"keys":r.keys.iter().map(|k|json!({"id":k.id,"name":k.name})).collect::<Vec<_>>()}),
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(windows)]
    #[test]
    #[ignore = "Explicit isolated Windows Credential Manager verification"]
    fn windows_credential_roundtrip() {
        struct Cleanup(String);
        impl Drop for Cleanup {
            fn drop(&mut self) {
                let b = WindowsBackend(&self.0);
                if let Ok(r) = load(&b) {
                    for k in r.keys {
                        let _ = b.remove(&format!("key-{}", k.id));
                    }
                }
                let _ = b.remove("registry");
                let _ = b.remove("legacy");
            }
        }
        let cleanup = Cleanup(format!("verification-{}", consilium_domain::id()));
        let b = WindowsBackend(&cleanup.0);
        for i in 0..10 {
            manage_with(
                &b,
                "save",
                &json!({"name":format!("Synthetic {i}"),"key":"s".repeat(1000)}),
            )
            .unwrap();
        }
        let reopened = WindowsBackend(&cleanup.0);
        let r = load(&reopened).unwrap();
        assert_eq!(r.keys.len(), 10);
        assert!(r.keys.iter().all(|k| k.secret == "s".repeat(1000)));
        manage_with(&reopened, "select", &json!({"id":r.keys[0].id})).unwrap();
        assert_eq!(load(&reopened).unwrap().selected, r.keys[0].id);
        for k in r.keys {
            manage_with(&reopened, "delete", &json!({"id":k.id})).unwrap();
            assert!(reopened.read(&format!("key-{}", k.id)).unwrap().is_none());
        }
        assert!(load(&reopened).unwrap().keys.is_empty());
    }
    use std::{
        cell::{Cell, RefCell},
        collections::HashMap,
    };
    #[derive(Default)]
    struct Memory {
        data: RefCell<HashMap<String, String>>,
        fail: Cell<bool>,
    }
    impl Backend for Memory {
        fn read(&self, n: &str) -> Result<Option<String>> {
            Ok(self.data.borrow().get(n).cloned())
        }
        fn write(&self, n: &str, v: &str) -> Result<()> {
            if self.fail.get() {
                bail!("simulated failure");
            }
            assert!(v.encode_utf16().count() * 2 <= 2560);
            self.data.borrow_mut().insert(n.into(), v.into());
            Ok(())
        }
        fn remove(&self, n: &str) -> Result<()> {
            self.data.borrow_mut().remove(n);
            Ok(())
        }
    }
    #[test]
    fn ten_long_keys_fit_separate_windows_entries() {
        let b = Memory::default();
        for i in 0..10 {
            let result = manage_with(
                &b,
                "save",
                &json!({"name":format!("Key {i}"),"key":"s".repeat(1000)}),
            )
            .unwrap();
            assert!(!result.to_string().contains(&"s".repeat(20)));
        }
        assert_eq!(load(&b).unwrap().keys.len(), 10);
    }
    #[test]
    fn legacy_migration_and_deletion_remove_old_copies() {
        let b = Memory::default();
        b.write("legacy", "synthetic").unwrap();
        let r = manage_with(&b, "list", &json!({})).unwrap();
        assert_eq!(r["keys"][0]["name"], "Existing key");
        manage_with(&b, "select", &json!({"id":"legacy"})).unwrap();
        assert!(b.read("legacy").unwrap().is_none());
        assert_eq!(load(&b).unwrap().keys[0].secret, "synthetic");
        manage_with(&b, "delete", &json!({"id":"legacy"})).unwrap();
        assert!(b.read("key-legacy").unwrap().is_none());
        assert!(load(&b).unwrap().keys.is_empty());
    }
    #[test]
    fn failed_save_preserves_selection() {
        let b = Memory::default();
        manage_with(&b, "save", &json!({"name":"One","key":"synthetic"})).unwrap();
        let before = b.read("registry").unwrap();
        b.fail.set(true);
        assert!(manage_with(&b, "save", &json!({"name":"Two","key":"new-synthetic"})).is_err());
        assert_eq!(before, b.read("registry").unwrap());
        assert_eq!(load(&b).unwrap().keys.len(), 1);
    }
    #[test]
    fn bundled_v1_registry_migrates_without_losing_keys() {
        let b = Memory::default();
        b.write(
            "registry",
            r#"{"selected":"a","keys":[{"id":"a","name":"Personal","secret":"synthetic"}]}"#,
        )
        .unwrap();
        manage_with(&b, "select", &json!({"id":"a"})).unwrap();
        let raw = b.read("registry").unwrap().unwrap();
        assert!(!raw.contains("synthetic"));
        assert_eq!(load(&b).unwrap().keys[0].secret, "synthetic");
    }
}
