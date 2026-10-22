pub mod process;
pub mod runtime;
use anyhow::{ensure, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Node {
    pub id: String,
    pub kind: String,
    pub title: String,
    #[serde(default)]
    pub config: Value,
    #[serde(default)]
    pub position: Position,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Position {
    pub x: f64,
    pub y: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Edge {
    pub id: String,
    pub source: String,
    pub target: String,
    #[serde(default = "out")]
    pub source_port: String,
    #[serde(default = "input")]
    pub target_port: String,
}
fn out() -> String {
    "out".into()
}
fn input() -> String {
    "in".into()
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NetworkDefinition {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
    #[serde(default)]
    pub limits: Limits,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Limits {
    pub concurrency: usize,
    pub iterations: usize,
    pub model_calls: usize,
    pub timeout_seconds: u64,
}
impl Default for Limits {
    fn default() -> Self {
        Self {
            concurrency: 2,
            iterations: 5,
            model_calls: 20,
            timeout_seconds: 1800,
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CompiledPlan {
    pub schema_version: u32,
    pub network: NetworkDefinition,
    pub revision: i64,
    pub digest: String,
    pub order: Vec<String>,
}
pub const NODE_KINDS: &[&str] = &[
    "input",
    "output",
    "agent",
    "process",
    "file_read",
    "folder_read",
    "file_write",
    "calendar_read",
    "calendar_change",
    "document_read",
    "document_write",
    "document_export",
    "condition",
    "parallel",
    "join",
    "loop",
    "validate",
    "approval",
];
pub fn digest(v: &impl Serialize) -> Result<String> {
    Ok(format!("{:x}", Sha256::digest(serde_json::to_vec(v)?)))
}
pub fn compile(network: &NetworkDefinition, revision: i64) -> Result<CompiledPlan> {
    compile_depth(network, revision, 0)
}
fn compile_depth(n: &NetworkDefinition, revision: i64, depth: usize) -> Result<CompiledPlan> {
    ensure!(n.schema_version == 1, "Unsupported network schema");
    ensure!(
        !n.id.is_empty() && !n.name.trim().is_empty(),
        "Network ID and name are required"
    );
    ensure!(
        !n.nodes.is_empty() && n.nodes.len() <= 200,
        "Use 1–200 nodes"
    );
    ensure!(depth <= 3, "Loops may nest at most three levels");
    ensure!(
        (1..=8).contains(&n.limits.concurrency)
            && (1..=50).contains(&n.limits.iterations)
            && (1..=200).contains(&n.limits.model_calls)
            && (1..=7200).contains(&n.limits.timeout_seconds),
        "Invalid run limits"
    );
    let mut nodes = BTreeMap::new();
    for node in &n.nodes {
        ensure!(
            node.id.len() <= 100
                && node
                    .id
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'),
            "Node IDs must use letters, digits, hyphens or underscores"
        );
        ensure!(
            !node.id.is_empty() && nodes.insert(node.id.clone(), node).is_none(),
            "Duplicate or empty node ID"
        );
        ensure!(
            NODE_KINDS.contains(&node.kind.as_str()),
            "Unknown node type {}",
            node.kind
        );
        let required = match node.kind.as_str() {
            "agent" => vec!["profile_id", "system_prompt"],
            "process" => vec!["executable_binding", "source"],
            "file_read" | "folder_read" | "file_write" => vec!["binding_id"],
            "calendar_read" | "calendar_change" => vec!["calendar_id"],
            "document_read" | "document_export" => vec!["document_id"],
            _ => vec![],
        };
        for field in required {
            ensure!(
                node.config[field]
                    .as_str()
                    .is_some_and(|s| !s.trim().is_empty()),
                "{}: {field} is required",
                node.title
            );
        }
        if node.kind == "process" {
            ensure!(
                node.config["source"].as_str().unwrap().len() <= 100000,
                "Script source exceeds 100 KB"
            );
            if let Some(args) = node.config.get("args") {
                ensure!(
                    args.as_array()
                        .is_some_and(|a| a.iter().all(Value::is_string)),
                    "Process args must be a string array"
                );
            }
        }
        if node.kind == "validate" {
            jsonschema::validator_for(&node.config["schema"])
                .map_err(|e| anyhow::anyhow!("{}: invalid JSON schema: {e}", node.title))?;
        }
        if node.kind == "agent" && node.config.get("schema").is_some() {
            jsonschema::validator_for(&node.config["schema"])
                .map_err(|e| anyhow::anyhow!("Invalid agent output schema: {e}"))?;
        }
        if node.kind == "loop" {
            let body: NetworkDefinition = serde_json::from_value(node.config["body"].clone())
                .context("Loop needs a network body")?;
            compile_depth(&body, revision, depth + 1)?;
            ensure!(
                !body.nodes.iter().any(|n| n.kind == "approval"),
                "Place human approval outside loop bodies"
            );
            ensure!(
                node.config["max_iterations"]
                    .as_u64()
                    .is_some_and(|n| n > 0 && n <= 50),
                "Loop needs a bounded iteration limit"
            );
            ensure!(
                node.config.get("stop_equals").is_some(),
                "Loop needs a stop condition"
            );
        }
    }
    let mut incoming: BTreeMap<String, usize> = nodes.keys().map(|id| (id.clone(), 0)).collect();
    let mut ids = BTreeSet::new();
    for e in &n.edges {
        ensure!(ids.insert(&e.id), "Duplicate edge ID");
        let source = nodes.get(&e.source).context("Edge source is missing")?;
        ensure!(nodes.contains_key(&e.target), "Edge target is missing");
        let target = nodes[&e.target];
        let output_type =
            source.config["output_type"]
                .as_str()
                .unwrap_or(match source.kind.as_str() {
                    "agent" if source.config.get("schema").is_none() => "text",
                    "file_read" if source.config["format"] != "json" => "text",
                    _ => "json",
                });
        let input_type = target.config["input_type"].as_str().unwrap_or("any");
        ensure!(
            ["text", "json", "any"].contains(&input_type)
                && ["text", "json"].contains(&output_type),
            "Unknown port data type"
        );
        ensure!(
            input_type == "any" || input_type == output_type,
            "Incompatible connection: {} produces {output_type}, {} requires {input_type}",
            source.title,
            target.title
        );
        ensure!(e.source != e.target, "Use an explicit bounded loop");
        ensure!(
            if source.kind == "condition" {
                ["true", "false"].contains(&e.source_port.as_str())
            } else {
                e.source_port == "out"
            },
            "Invalid output port"
        );
        ensure!(e.target_port == "in", "Invalid input port");
        *incoming.get_mut(&e.target).unwrap() += 1;
    }
    for node in &n.nodes {
        if ![
            "input",
            "file_read",
            "folder_read",
            "calendar_read",
            "document_read",
            "document_export",
        ]
        .contains(&node.kind.as_str())
        {
            ensure!(
                incoming[&node.id] > 0,
                "{} requires an input connection",
                node.title
            );
        }
    }
    let mut ready: Vec<String> = incoming
        .iter()
        .filter(|(_, count)| **count == 0)
        .map(|(id, _)| id.clone())
        .collect();
    let mut order = vec![];
    while let Some(id) = ready.pop() {
        order.push(id.clone());
        for e in n.edges.iter().filter(|e| e.source == id) {
            let count = incoming.get_mut(&e.target).unwrap();
            *count -= 1;
            if *count == 0 {
                ready.push(e.target.clone());
            }
        }
    }
    ensure!(
        order.len() == n.nodes.len(),
        "Ordinary connections must be acyclic; use a bounded loop node"
    );
    Ok(CompiledPlan {
        schema_version: 1,
        network: n.clone(),
        revision,
        digest: digest(&(n, revision))?,
        order,
    })
}
/// Only the graph contract is portable. Bindings and profiles are logical IDs.
pub fn export(n: &NetworkDefinition) -> Result<Value> {
    compile(n, 0)?;
    fn inspect(v: &Value, key: &str) -> Result<()> {
        match v {
            Value::Object(o) => {
                for (k, v) in o {
                    ensure!(
                        ![
                            "api_key",
                            "secret",
                            "credential_id",
                            "path",
                            "environment",
                            "context",
                            "messages",
                            "logs"
                        ]
                        .contains(&k.as_str()),
                        "Export cannot include {k}"
                    );
                    inspect(v, k)?;
                }
            }
            Value::Array(a) => {
                for v in a {
                    inspect(v, key)?;
                }
            }
            Value::String(s) => {
                if !["source", "system_prompt", "pointer", "stop_pointer"].contains(&key) {
                    ensure!(
                        !(s.starts_with('/')
                            || s.starts_with("\\\\")
                            || s.as_bytes().get(1) == Some(&b':')),
                        "Export contains an absolute device path"
                    );
                }
            }
            _ => {}
        }
        Ok(())
    }
    let mut value = json!(n);
    fn omit_inputs(graph: &mut Value) {
        if let Some(nodes) = graph["nodes"].as_array_mut() {
            for node in nodes {
                if node["kind"] == "input" {
                    if let Some(config) = node["config"].as_object_mut() {
                        config.remove("value");
                    }
                }
                if node["kind"] == "loop" {
                    omit_inputs(&mut node["config"]["body"]);
                }
            }
        }
    }
    omit_inputs(&mut value);
    inspect(&value, "")?;
    Ok(json!({"format":"consilium-network","version":1,"network":value}))
}
pub fn import(value: Value) -> Result<NetworkDefinition> {
    ensure!(
        value["format"] == "consilium-network" && value["version"] == 1,
        "Unsupported network package"
    );
    let mut n: NetworkDefinition = serde_json::from_value(value["network"].clone())?;
    export(&n)?;
    n.id = consilium_domain::id();
    Ok(n)
}
#[cfg(test)]
mod tests {
    use super::*;
    fn n() -> NetworkDefinition {
        NetworkDefinition {
            schema_version: 1,
            id: "n".into(),
            name: "Test".into(),
            nodes: vec![
                Node {
                    id: "a".into(),
                    kind: "input".into(),
                    title: "Input".into(),
                    config: json!({}),
                    position: Position::default(),
                },
                Node {
                    id: "b".into(),
                    kind: "output".into(),
                    title: "Output".into(),
                    config: json!({}),
                    position: Position::default(),
                },
            ],
            edges: vec![Edge {
                id: "e".into(),
                source: "a".into(),
                target: "b".into(),
                source_port: "out".into(),
                target_port: "in".into(),
            }],
            limits: Limits::default(),
        }
    }
    #[test]
    fn rejects_cycles_and_ports() {
        let mut n = n();
        assert!(compile(&n, 1).is_ok());
        n.edges.push(Edge {
            id: "e2".into(),
            source: "b".into(),
            target: "a".into(),
            source_port: "out".into(),
            target_port: "in".into(),
        });
        assert!(compile(&n, 1).is_err());
        n.edges.pop();
        n.edges[0].source_port = "bad".into();
        assert!(compile(&n, 1).is_err());
    }
    #[test]
    fn script_changes_change_digest() {
        let n = n();
        let mut changed = n.clone();
        changed.nodes[0].config = json!({"value":"changed"});
        assert_ne!(
            compile(&n, 1).unwrap().digest,
            compile(&changed, 1).unwrap().digest
        );
    }
    #[test]
    fn portable_exports_reject_device_paths() {
        let mut n = n();
        n.nodes[0].config = json!({"path":"C:\\private"});
        assert!(export(&n).is_err());
    }
}
