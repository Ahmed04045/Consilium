use anyhow::{ensure, Context, Result};
use consilium_application::Engine;
use consilium_storage::Store;
use serde_json::{json, Value};
use std::path::PathBuf;

pub fn source_path(input: &str) -> Result<PathBuf> {
    let path = PathBuf::from(input);
    let path = if path.is_dir() {
        path.join("project.consilium")
    } else {
        path
    };
    Ok(path
        .canonicalize()
        .context("Choose an existing project file or folder")?)
}

pub fn convert(args: &[String]) -> Result<Value> {
    ensure!(
        args.len() == 3 || (args.len() == 4 && args[3] == "--without-inputs"),
        "Usage: pack|extract SOURCE NEW_DESTINATION [--without-inputs]"
    );
    let source = source_path(&args[1])?;
    let destination = std::path::absolute(&args[2])?;
    ensure!(
        !destination.exists(),
        "Destination exists; choose a new file or folder"
    );
    ensure!(
        destination.parent().is_some_and(|p| p.is_dir()),
        "Destination parent folder must exist"
    );
    // Reuse the desktop's traversal/size/schema checks and copy-only import.
    // Temporary storage prevents conversion touching the user's working vault.
    let temporary = tempfile::tempdir()?;
    let engine = Engine::new(Store::new(temporary.path().join("vault"))?);
    let root = engine.project_action("next_project_read", json!({"path":source}))?;
    let result = engine.project_action(
        "next_project_write",
        json!({
            "kind":root["kind"],"id":root["id"],"path":destination,
            "mode":if args[0] == "extract" {"folder"} else {"file"},
            "inputs":!args.iter().any(|s|s=="--without-inputs")
        }),
    )?;
    Ok(json!({"path":result["path"],"copied":true,"identities_remapped":true,"executed":false}))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pack_extract_validates_and_never_overwrites() {
        let d = tempfile::tempdir().unwrap();
        let input = d.path().join("input.consilium");
        let package = json!({"format":"consilium-project","version":1,"root":{"kind":"network","id":"n"},"includes_inputs":true,"records":[{"kind":"network","id":"n","value":{"schema_version":1,"id":"n","name":"Test","nodes":[{"id":"input","kind":"input","title":"Input","config":{}}],"edges":[]}}],"bindings":[],"assets":[]});
        std::fs::write(&input, package.to_string()).unwrap();
        let folder = d.path().join("extracted");
        let args = vec![
            "extract".into(),
            input.to_string_lossy().into(),
            folder.to_string_lossy().into(),
        ];
        convert(&args).unwrap();
        assert!(convert(&args).is_err());
        let packed = d.path().join("copy.consi");
        assert!(convert(&[
            "pack".into(),
            folder.to_string_lossy().into(),
            packed.to_string_lossy().into()
        ])
        .is_ok());
        let copy: Value = serde_json::from_slice(&std::fs::read(packed).unwrap()).unwrap();
        assert_eq!(copy["format"], "consilium-project");
        assert_ne!(copy["root"]["id"], "n");
    }
    #[test]
    fn reject_traversal_without_writing_destination() {
        let d = tempfile::tempdir().unwrap();
        let input = d.path().join("bad.consi");
        std::fs::write(&input, json!({"format":"consilium-project","version":1,"assets":[{"relative":"../escape","bytes":[65]}]}).to_string()).unwrap();
        let destination = d.path().join("output");
        assert!(convert(&[
            "extract".into(),
            input.to_string_lossy().into(),
            destination.to_string_lossy().into()
        ])
        .is_err());
        assert!(!destination.exists());
        assert!(!d.path().join("escape").exists());
    }
}
