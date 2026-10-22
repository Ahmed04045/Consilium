use anyhow::{bail, Context, Result};
use consilium_application::Engine;
use consilium_storage::Store;
use serde_json::{json, Value};
#[tokio::main]
async fn main() {
    if let Err(e) = run().await {
        eprintln!("{e:#}");
        std::process::exit(1);
    }
}
async fn run() -> Result<()> {
    let mut args = std::env::args().skip(1).collect::<Vec<_>>();
    let vault = if args.first().map(String::as_str) == Some("--vault") {
        let p = args.get(1).context("--vault requires a path")?.clone();
        args.drain(0..2);
        std::path::PathBuf::from(p)
    } else {
        let base =
            std::path::PathBuf::from(std::env::var_os("LOCALAPPDATA").context("Use --vault PATH")?)
                .join("Consilium Next");
        let location = base.join("vault-location.json");
        if location.exists() {
            serde_json::from_slice(&std::fs::read(location)?)?
        } else {
            base
        }
    };
    let command = args.first().map(String::as_str).unwrap_or("help");
    if command == "help" {
        println!("consilium [--vault PATH] validate|compile|import NETWORK.json\nconsilium [--vault PATH] review NETWORK_ID\nconsilium [--vault PATH] run APPROVED_CONFIG.json\nconsilium [--vault PATH] runs|inspect RUN_ID|cancel RUN_ID\nconsilium [--vault PATH] inspect ID --kind changeset\nconsilium [--vault PATH] accept CHANGESET_ID --approve\nconsilium [--vault PATH] export NETWORK_ID DESTINATION.json --include-scripts\nNew run config: {{network_id, revision, approval_digest, input}}. Resume config: {{run_id, approval_digest, approved_nodes: [], retry_nodes: []}}. Inspect the complete review before approving. Imports never execute automatically.");
        return Ok(());
    }
    let engine = Engine::new(Store::new(vault)?);
    let arg = || args.get(1).context("Missing argument");
    let result = match command {
        "validate" | "compile" => {
            let mut value: Value = serde_json::from_slice(&std::fs::read(arg()?)?)?;
            if value["format"] == "consilium-network" {
                value = value["network"].take();
            }
            let n: consilium_workflow::NetworkDefinition = serde_json::from_value(value)?;
            json!(consilium_workflow::compile(&n, 0)?)
        }
        "import" => {
            engine
                .run(
                    "next_network_import",
                    json!({"package":serde_json::from_slice::<Value>(&std::fs::read(arg()?)?)?}),
                )
                .await?
        }
        "review" => {
            engine
                .run("next_network_review", json!({"id":arg()?}))
                .await?
        }
        "run" => {
            let mut config: Value = serde_json::from_slice(&std::fs::read(arg()?)?)?;
            let action = if config["run_id"].is_string() {
                config["id"] = config["run_id"].clone();
                "next_run_resume"
            } else {
                "next_network_run"
            };
            engine.run(action, config).await?
        }
        "runs" => json!(engine.next_list("run")?),
        "inspect" => json!(engine.next_get::<Value>(
            if args.get(2).map(String::as_str) == Some("--kind") {
                args.get(3).context("--kind requires a record type")?
            } else {
                "run"
            },
            arg()?
        )?),
        "accept" => {
            if args.get(2).map(String::as_str) != Some("--approve") {
                bail!("Inspect the changeset first, then pass --approve to accept it");
            }
            engine.accept_changes(arg()?)?
        }
        "cancel" => {
            consilium_workflow::runtime::cancel(&engine.store, arg()?)?;
            json!({"cancel_requested":true})
        }
        "export" => {
            if !args.iter().any(|a| a == "--include-scripts") {
                bail!("Graph exports include script source and prompts. Review them, then pass --include-scripts. Runtime inputs, credentials and bindings are excluded.");
            }
            let result = engine
                .run("next_network_export", json!({"id":arg()?}))
                .await?;
            let path = args.get(2).context("Choose an export file")?;
            std::fs::write(path, serde_json::to_vec_pretty(&result)?)?;
            json!({"saved":path})
        }
        _ => bail!("Unknown command. Run consilium help"),
    };
    println!("{}", serde_json::to_string_pretty(&result)?);
    if result["status"].as_str().is_some_and(|s| s != "completed") {
        std::process::exit(2);
    }
    Ok(())
}
