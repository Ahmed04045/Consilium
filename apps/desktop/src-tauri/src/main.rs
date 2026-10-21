#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use consilium_application::Engine;
use consilium_storage::Store;
use serde_json::Value;
use std::{collections::HashMap, sync::Mutex};
use tauri::{Emitter, Manager};
use tokio_util::sync::CancellationToken;
struct State {
    engine: Engine,
    jobs: Mutex<HashMap<String, CancellationToken>>,
}
#[tauri::command]
async fn rpc(
    app: tauri::AppHandle,
    state: tauri::State<'_, State>,
    request_id: String,
    action: String,
    payload: Value,
) -> Result<Value, String> {
    if action == "choose_task_folder" {
        let snapshot = state
            .engine
            .run("workspace_load", payload.clone())
            .await
            .map_err(|e| e.to_string())?;
        if let Some(folder) = rfd::AsyncFileDialog::new()
            .set_title("Link a folder to this workspace")
            .pick_folder()
            .await
        {
            let canonical = folder
                .path()
                .canonicalize()
                .map_err(|_| "Folder is unavailable")?;
            let mut next = payload;
            next["path"] = Value::String(canonical.to_string_lossy().to_string());
            next["revision"] = snapshot["folder"]["revision"].clone();
            return state
                .engine
                .run("workspace_set_folder", next)
                .await
                .map_err(|e| e.to_string());
        }
        return Ok(serde_json::json!({"cancelled":true}));
    }
    if action == "open_task_folder" {
        let snapshot = state
            .engine
            .run("workspace_load", payload)
            .await
            .map_err(|e| e.to_string())?;
        let path = snapshot["folder"]["value"]["path"]
            .as_str()
            .ok_or("No linked folder")?;
        if path.is_empty() || !std::path::Path::new(path).is_dir() {
            return Err("The linked folder is unavailable".into());
        }
        std::process::Command::new("explorer.exe")
            .arg(path)
            .spawn()
            .map_err(|_| "Could not open folder")?;
        return Ok(Value::Null);
    }
    if action == "export_workspace_document" {
        let bytes: Vec<u8> = serde_json::from_value(payload["bytes"].clone())
            .map_err(|_| "Invalid document export")?;
        if bytes.len() > 8_000_000 {
            return Err("Document export exceeds 8 MB".into());
        }
        let name = payload["name"].as_str().unwrap_or("document.docx");
        let safe_name = std::path::Path::new(name)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("document.docx");
        if let Some(file) = rfd::AsyncFileDialog::new()
            .set_file_name(safe_name)
            .save_file()
            .await
        {
            use std::io::Write;
            let mut temp =
                tempfile::NamedTempFile::new_in(file.path().parent().ok_or("Invalid destination")?)
                    .map_err(|e| e.to_string())?;
            temp.write_all(&bytes).map_err(|e| e.to_string())?;
            temp.as_file().sync_all().map_err(|e| e.to_string())?;
            temp.persist(file.path()).map_err(|e| e.to_string())?;
            return Ok(serde_json::json!({"saved":true}));
        }
        return Ok(serde_json::json!({"saved":false}));
    }
    if action == "new_window" {
        let label = format!(
            "workspace-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|e| e.to_string())?
                .as_nanos()
        );
        tauri::WebviewWindowBuilder::new(&app, label, tauri::WebviewUrl::App("index.html".into()))
            .title("Consilium")
            .inner_size(1320.0, 880.0)
            .min_inner_size(940.0, 640.0)
            .decorations(false)
            .build()
            .map_err(|e| e.to_string())?;
        return Ok(Value::Null);
    }
    if action == "export_calendar_file" {
        let result = state
            .engine
            .run("calendar_export", payload)
            .await
            .map_err(|e| e.to_string())?;
        if let Some(file) = rfd::AsyncFileDialog::new()
            .set_file_name("calendar.ics")
            .add_filter("Calendar", &["ics"])
            .save_file()
            .await
        {
            use std::io::Write;
            let parent = file.path().parent().ok_or("Invalid destination")?;
            let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
            temp.write_all(result["text"].as_str().ok_or("Invalid export")?.as_bytes())
                .map_err(|e| e.to_string())?;
            temp.as_file().sync_all().map_err(|e| e.to_string())?;
            temp.persist(file.path()).map_err(|e| e.to_string())?;
            return Ok(serde_json::json!({"saved":true}));
        }
        return Ok(serde_json::json!({"saved":false}));
    }
    if action == "choose_vault" {
        let folder = rfd::AsyncFileDialog::new()
            .set_title("Choose a local Consilium vault folder")
            .pick_folder()
            .await;
        if let Some(folder) = folder {
            let path = folder.path().to_path_buf();
            if path.ancestors().any(|p| p.join(".git").exists()) {
                return Err(
                    "Choose a folder outside a source repository to keep personal data private."
                        .into(),
                );
            }
            Store::new(path.clone()).map_err(|e| e.to_string())?;
            save_vault_location(&path).map_err(|e| e.to_string())?;
            app.restart();
        }
        return Ok(Value::Null);
    }
    if action == "restore_backup" {
        let backup_id = payload["id"].as_str().ok_or("Choose a backup")?;
        let root = base_root()
            .map_err(|e| e.to_string())?
            .join("restored-vaults")
            .join(format!(
                "{}-{}",
                backup_id,
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map_err(|e| e.to_string())?
                    .as_millis()
            ));
        {
            let _guard = state
                .engine
                .gate
                .lock()
                .map_err(|_| "Storage unavailable")?;
            state
                .engine
                .store
                .restore_copy(backup_id, root.clone())
                .map_err(|e| e.to_string())?;
        }
        save_vault_location(&root).map_err(|e| e.to_string())?;
        app.restart();
    }
    if action == "open_resource" {
        let url = payload["url"].as_str().ok_or("Missing URL")?;
        consilium_adapters::public_url(url).map_err(|e| e.to_string())?;
        webbrowser::open(url).map_err(|_| "Could not open browser")?;
        return Ok(Value::Null);
    }
    let token = CancellationToken::new();
    state
        .jobs
        .lock()
        .unwrap()
        .insert(request_id.clone(), token.clone());
    let operation = async {
        if action == "chat" {
            let question = payload["question"]
                .as_str()
                .ok_or_else(|| "Missing question".to_string())?;
            state
                .engine
                .chat(question, |chunk| {
                    let _ = app.emit(
                        "chat-chunk",
                        serde_json::json!({"request_id":request_id,"chunk":chunk}),
                    );
                })
                .await
                .map_err(|e| format!("{e:#}"))
        } else {
            state
                .engine
                .run(&action, payload)
                .await
                .map_err(|e| format!("{e:#}"))
        }
    };
    let result = tokio::select! {_ = token.cancelled()=>Err("Cancelled. Existing work is unchanged.".into()),result=operation=>result};
    state.jobs.lock().unwrap().remove(&request_id);
    result
}
#[tauri::command]
fn cancel(state: tauri::State<'_, State>, request_id: String) {
    if let Some(token) = state.jobs.lock().unwrap().get(&request_id) {
        token.cancel();
    }
}
fn base_root() -> Result<std::path::PathBuf, Box<dyn std::error::Error>> {
    Ok(std::path::PathBuf::from(
        std::env::var_os("LOCALAPPDATA").ok_or("LOCALAPPDATA is not available")?,
    )
    .join("Consilium"))
}
fn save_vault_location(path: &std::path::Path) -> Result<(), Box<dyn std::error::Error>> {
    use std::io::Write;
    let base = base_root()?;
    std::fs::create_dir_all(&base)?;
    let mut temporary = tempfile::NamedTempFile::new_in(&base)?;
    temporary.write_all(&serde_json::to_vec(path)?)?;
    temporary.as_file().sync_all()?;
    temporary.persist(base.join("vault-location.json"))?;
    Ok(())
}
fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let base = base_root()?;
            let root = if base.join("vault-location.json").exists() {
                serde_json::from_slice::<std::path::PathBuf>(&std::fs::read(
                    base.join("vault-location.json"),
                )?)?
            } else {
                base
            };
            let engine = Engine::new(Store::new(root)?);
            let worker = engine.clone();
            let handle = app.handle().clone();
            app.manage(State {
                engine,
                jobs: Mutex::new(HashMap::new()),
            });
            tauri::async_runtime::spawn(async move {
                loop {
                    if worker.background_step().await.is_ok() {
                        let _ = handle.emit("index-progress", ());
                    }
                    tokio::time::sleep(std::time::Duration::from_secs(3)).await;
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![rpc, cancel])
        .run(tauri::generate_context!())
        .expect("Consilium could not start");
}
