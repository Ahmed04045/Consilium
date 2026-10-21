//! Explicit live test. Uses a temporary synthetic vault and the selected Gemini key.
//! No real calendars, documents or context are opened. Nothing is accepted automatically.
use anyhow::{ensure, Result};
use consilium_application::Engine;
use consilium_domain::Settings;
use consilium_storage::Store;
use serde_json::{json, Value};

async fn check(model: String) -> Result<()> {
    let temp = tempfile::tempdir()?;
    let engine = Engine::new(Store::new(temp.path().into())?);
    engine.store.write(
        "settings",
        0,
        &Settings {
            provider: "gemini".into(),
            chat_model: model,
            context_tokens: 32768,
            ..Settings::default()
        },
    )?;
    engine.store.write("calendar_workspace", 0, &json!({
        "onboarded":true, "timezone":"Asia/Qatar", "labels":[{"name":"Practice", "color":"green"}],
        "calendars":[
            {"id":"first", "name":"First test calendar", "tasks":[]},
            {"id":"second", "name":"Second test calendar", "tasks":[]}
        ]
    }))?;
    let before = serde_json::to_value(engine.store.read::<Value>("calendar_workspace")?)?;
    let context = engine
        .run(
            "calendar_context",
            json!({"calendar_id":"second","date":"2026-10-21"}),
        )
        .await?;
    let response = engine.run("calendar_propose", json!({
        "calendar_id":"second", "date":"2026-10-21", "days":1,
        "request":"Suggest exactly one 15-minute reading practice task on October 21, 2026, starting at 10:00. Use label Practice and green color.",
        "cloud_approved":true, "cloud_provider":"gemini",
        "context_revision":context["revision"], "settings_revision":context["settings_revision"],
        "personal_revision":0
    })).await?;
    let tasks = response["tasks"]
        .as_array()
        .ok_or_else(|| anyhow::anyhow!("Missing tasks"))?;
    ensure!(tasks.len() == 1, "Expected one task");
    ensure!(
        tasks[0]["date"] == "2026-10-21"
            && tasks[0]["time"] == "10:00"
            && tasks[0]["minutes"] == 15,
        "Task did not match the requested schedule"
    );
    ensure!(
        tasks[0]["label"] == "Practice" && tasks[0]["color"] == "green",
        "Task did not match the requested label"
    );
    let after = serde_json::to_value(engine.store.read::<Value>("calendar_workspace")?)?;
    ensure!(before == after, "A proposal changed an accepted calendar");
    println!("Synthetic two-calendar Gemini proposal passed schema, scheduling and unchanged-calendar checks.");
    Ok(())
}

#[tokio::main]
async fn main() {
    let model = std::env::args().nth(1).unwrap_or_default();
    if model.is_empty() {
        eprintln!("Pass the exact model ID, never an API key.");
        std::process::exit(2);
    }
    let result = tokio::time::timeout(std::time::Duration::from_secs(120), check(model)).await;
    match result {
        Ok(Ok(())) => (),
        Ok(Err(error)) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
        Err(_) => {
            eprintln!("Synthetic calendar diagnostic timed out.");
            std::process::exit(1);
        }
    }
}
