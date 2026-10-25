use anyhow::{bail, Context, Result};
use consilium_application::Engine;
use consilium_storage::Store;
use serde_json::{json, Value};
mod packages;
#[tokio::main]
async fn main() {
    if let Err(e) = run().await {
        eprintln!("{e:#}");
        std::process::exit(1);
    }
}
async fn run() -> Result<()> {
    let mut args = std::env::args().skip(1).collect::<Vec<_>>();
    if args
        .first()
        .is_some_and(|s| matches!(s.as_str(), "--version" | "-V" | "version"))
    {
        println!(
            "consi {} (Consilium workflow runtime)",
            env!("CARGO_PKG_VERSION")
        );
        return Ok(());
    }
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
    if matches!(command, "pack" | "extract") {
        let result = packages::convert(&args)?;
        println!("{}", serde_json::to_string_pretty(&result)?);
        return Ok(());
    }
    if matches!(command, "help" | "--help" | "-h") {
        println!("Portable projects (no desktop app needed):\nconsi pack SOURCE.consilium|FOLDER DEST.consilium [--without-inputs]\nconsi extract SOURCE.consilium NEW_FOLDER [--without-inputs]\nconsi [--vault PATH] import FILE.consilium|NETWORK.json\nconsi [--vault PATH] bind ID PATH --kind file|folder|executable [--writable]\nconsi [--vault PATH] configure RECORD.json (profile or binding, expected revision required)\nProject conversion creates a validated portable copy with new record identities. Import never executes. Use review then run to execute.\n");
        println!("consi [--vault PATH] validate|compile|import NETWORK.json\nconsi [--vault PATH] review NETWORK_ID\nconsi [--vault PATH] run APPROVED_CONFIG.json\nconsi [--vault PATH] tick (execute one due, previously approved automation)\nconsi [--vault PATH] runs|inspect RUN_ID|cancel RUN_ID\nconsi [--vault PATH] inspect ID --kind changeset\nconsi [--vault PATH] accept CHANGESET_ID --approve\nconsi [--vault PATH] export NETWORK_ID DESTINATION.json --include-scripts\nNew run config: {{network_id, revision, approval_digest, input}}. Resume config: {{run_id, approval_digest, approved_nodes: [], retry_nodes: []}}. Inspect the complete review before approving. Imports never execute automatically.");
        return Ok(());
    }
    let engine = Engine::new(Store::new(vault)?);
    let arg = || args.get(1).context("Missing argument");
    let result = match command {
        "tick" => engine.automation_tick().await?,
        "validate" | "compile" => {
            let mut value: Value = serde_json::from_slice(&std::fs::read(arg()?)?)?;
            if value["format"] == "consilium-network" {
                value = value["network"].take();
            }
            let n: consilium_workflow::NetworkDefinition = serde_json::from_value(value)?;
            json!(consilium_workflow::compile(&n, 0)?)
        }
        "import" => {
            let path = packages::source_path(arg()?)?;
            let package: Value = serde_json::from_slice(&std::fs::read(&path)?)?;
            if package["format"] == "consilium-project" {
                engine
                    .run("next_project_read", json!({"path":path}))
                    .await?
            } else {
                engine
                    .run("next_network_import", json!({"package":package}))
                    .await?
            }
        }
        "bind" => {
            let id = arg()?;
            let path = std::path::absolute(args.get(2).context("Choose a local path")?)?;
            let kind_index = args
                .iter()
                .position(|s| s == "--kind")
                .context("Specify --kind file|folder|executable")?;
            let kind = args.get(kind_index + 1).context("Missing binding kind")?;
            anyhow::ensure!(
                ["file", "folder", "executable"].contains(&kind.as_str()),
                "Unknown binding kind"
            );
            let old = engine.next_get::<Value>("binding", id).ok();
            engine.run("next_save", json!({"kind":"binding","revision":old.map_or(0, |r|r.revision),"value":{"id":id,"name":id,"kind":kind,"path":path,"writable":args.iter().any(|s|s=="--writable")}})).await?
        }
        "configure" => {
            let request: Value = serde_json::from_slice(&std::fs::read(arg()?)?)?;
            anyhow::ensure!(
                ["profile", "binding"].contains(&request["kind"].as_str().unwrap_or("")),
                "Configure accepts only profiles or local bindings"
            );
            anyhow::ensure!(
                request["revision"].as_i64().is_some(),
                "Specify the expected record revision (0 for new)"
            );
            engine.run("next_save", request).await?
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
        _ => bail!("Unknown command. Run consi help"),
    };
    println!("{}", serde_json::to_string_pretty(&result)?);
    if result["status"].as_str().is_some_and(|s| s != "completed") {
        std::process::exit(2);
    }
    Ok(())
}
