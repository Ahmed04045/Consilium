use super::*;
use consilium_workflow::{compile, runtime, NetworkDefinition, Node};
use std::sync::Arc;
fn nodes(n: &NetworkDefinition) -> Result<Vec<Node>> {
    let mut out = vec![];
    for node in &n.nodes {
        out.push(node.clone());
        if node.kind == "loop" {
            out.extend(nodes(&decode(node.config["body"].clone())?)?);
        }
    }
    Ok(out)
}
impl Engine {
    fn requirements(&self, network: &NetworkDefinition) -> Result<Vec<Value>> {
        let mut out = vec![];
        for n in nodes(network)? {
            let mut specs = vec![];
            match n.kind.as_str() {
                "process" if n.config["operation"].as_str().unwrap_or("script") == "script" => {
                    specs.push(("executable_binding", "binding", "executable", false));
                    if n.config.get("script_binding").is_some() {
                        specs.push(("script_binding", "binding", "file", false));
                    }
                }
                "addon" => {
                    specs.push(("executable_binding", "binding", "executable", false));
                    specs.push(("addon_id", "addon", "", false));
                }
                "agent" | "planner" => {
                    specs.push(("profile_id", "profile", "", false));
                    if n.config["include_goal_context"] == true {
                        specs.push(("calendar_id", "calendar", "", false));
                    }
                }
                "file_read" => specs.push(("binding_id", "binding", "file", false)),
                "folder_read" => specs.push(("binding_id", "binding", "folder", false)),
                "file_write" => specs.push(("binding_id", "binding", "file", true)),
                "calendar_read" | "calendar_change" | "goal_context" => {
                    specs.push(("calendar_id", "calendar", "", false))
                }
                "network_read" | "network_change" => {
                    specs.push(("network_id", "network", "", false))
                }
                "document_read" | "document_export" => {
                    specs.push(("document_id", "document", "", false));
                    if n.kind == "document_export" && n.config.get("binding_id").is_some() {
                        specs.push(("binding_id", "binding", "file", true));
                    }
                }
                "document_write" if n.config.get("document_id").is_some() => {
                    specs.push(("document_id", "document", "", false))
                }
                _ => {}
            }
            for (field_name, kind, resource_kind, writable) in specs {
                let id = n.config[field_name].as_str().unwrap_or("");
                let record = self.next_get::<Value>(kind, id).ok();
                let mut problem = String::new();
                if let Some(r) = &record {
                    if kind == "binding" {
                        if r.value["kind"] != resource_kind {
                            problem = format!(
                                "Choose a {resource_kind}, not this {} binding",
                                r.value["kind"].as_str().unwrap_or("unknown")
                            );
                        } else if r.value["writable"].as_bool().unwrap_or(false) != writable {
                            problem = if writable {
                                "Choose a writable output"
                            } else {
                                "Choose a read-only input/runtime"
                            }
                            .into();
                        } else {
                            let path = std::path::Path::new(r.value["path"].as_str().unwrap_or(""));
                            if !writable
                                && !(if resource_kind == "folder" {
                                    path.is_dir()
                                } else {
                                    path.is_file()
                                })
                            {
                                problem = "Bound resource is unavailable".into();
                            }
                            if resource_kind == "executable"
                                && cfg!(windows)
                                && !path
                                    .extension()
                                    .is_some_and(|e| e.eq_ignore_ascii_case("exe"))
                            {
                                problem = "Choose an installed .exe runtime".into();
                            }
                        }
                    } else if kind == "addon" && r.value["enabled"] != true {
                        problem = "Review and enable this add-on first".into();
                    }
                } else {
                    problem = format!(
                        "Choose a {kind}{}",
                        if resource_kind.is_empty() {
                            "".into()
                        } else {
                            format!(" ({resource_kind})")
                        }
                    );
                }
                out.push(json!({"node_id":n.id,"node_title":n.title,"field":field_name,"record_kind":kind,"resource_kind":resource_kind,"writable":writable,"id":id,"name":record.map(|r|r.value["name"].clone()),"ready":problem.is_empty(),"problem":problem}));
            }
        }
        Ok(out)
    }
    pub(super) fn check_authoring_bindings(&self, n: &NetworkDefinition) -> Result<()> {
        let missing = self
            .requirements(n)?
            .into_iter()
            .filter(|r| r["ready"] != true)
            .map(|r| {
                format!(
                    "{}: {} ({})",
                    r["node_title"].as_str().unwrap_or("Node"),
                    r["problem"].as_str().unwrap_or("Missing resource"),
                    r["field"].as_str().unwrap_or("")
                )
            })
            .collect::<Vec<_>>();
        ensure!(
            missing.is_empty(),
            "Resources need setup; ask for these rather than inventing or substituting them: {}",
            missing.join("; ")
        );
        Ok(())
    }
    pub async fn authoring_action(&self, action: &str, p: Value) -> Result<Value> {
        match action {
            "next_authoring_readiness" => {
                let n: NetworkDefinition = decode(p["network"].clone())?;
                let revision = p["revision"].as_i64().unwrap_or(0);
                let compiled = compile(&n, revision);
                let structure_error = compiled.as_ref().err().map(ToString::to_string);
                let requirements = self.requirements(&n).unwrap_or_default();
                let mut warnings = vec![];
                for node in nodes(&n).unwrap_or_default() {
                    if node.kind == "validate"
                        && node.config["schema"]["type"] == "object"
                        && node.config["schema"]
                            .as_object()
                            .is_some_and(|s| s.len() == 1)
                    {
                        warnings.push(json!({"node_id":node.id,"message":"This schema accepts every object. Supply the actual output contract; structure alone is not behavioral validation."}));
                    }
                    if node.kind == "process" {
                        let source = node.config["source"].as_str().unwrap_or("").to_lowercase();
                        if (source.contains("success")
                            || source.contains("\"valid\": true")
                            || source.contains("\"valid\":true")
                            || source.contains("valid: true"))
                            && !source.contains("if ")
                            && !source.contains("if(")
                            && !source.contains("if (")
                        {
                            warnings.push(json!({"node_id":node.id,"message":"Possible placeholder: unconditional success/valid output. Inspect the code and test real failure cases. This heuristic is not proof of an error."}));
                        }
                    }
                }
                let review = match compiled {
                    Ok(plan) => Some(runtime::review(self, plan).await),
                    Err(_) => None,
                };
                let resource_error = review
                    .as_ref()
                    .and_then(|r| r.as_ref().err())
                    .map(ToString::to_string);
                let digest = review
                    .as_ref()
                    .and_then(|r| r.as_ref().ok())
                    .map(|r| r.approval_digest.clone());
                let mut tests = vec![];
                for t in self.next_list("test")? {
                    if t.value["network_id"] == n.id {
                        let mut result = self.test_result(field(&t.value, "run_id")?)?;
                        result["current_revision"] = json!(digest
                            .as_ref()
                            .is_some_and(|d| t.value["approval_digest"] == *d));
                        tests.push(result);
                    }
                }
                Ok(
                    json!({"structure_valid":structure_error.is_none(),"structure_error":structure_error,"resources_ready":digest.is_some() && requirements.iter().all(|r| r["ready"] == true),"resource_error":resource_error,"requirements":requirements,"warnings":warnings,"implementation":"untested unless supported by the specific sample results below","tests":tests}),
                )
            }
            "next_authoring_review" => {
                let n: NetworkDefinition = decode(p["network"].clone())?;
                Ok(json!(
                    runtime::review(self, compile(&n, p["revision"].as_i64().unwrap_or(0))?)
                        .await?
                ))
            }
            "next_authoring_json_file" => {
                let path = std::path::Path::new(field(&p, "path")?);
                ensure!(
                    std::fs::metadata(path)?.len() <= 1_000_000,
                    "Test JSON must be at most 1 MB"
                );
                let bytes = std::fs::read(path)?;
                ensure!(bytes.len() <= 1_000_000, "Test file grew; choose again");
                Ok(
                    json!({"name":path.file_name().unwrap_or_default().to_string_lossy(),"value":serde_json::from_slice::<Value>(&bytes).context("Choose a valid JSON test file")?}),
                )
            }
            "next_authoring_test" => {
                ensure!(
                    p["approved"] == true,
                    "Review scripts, model destinations and writes before testing"
                );
                ensure!(
                    p.get("expected").is_some() && p.get("input").is_some(),
                    "Choose sample input and independent expected output"
                );
                ensure!(
                    p["expected"].to_string().len() + p["input"].to_string().len() <= 2_000_000,
                    "Test data exceeds 2 MB"
                );
                let n: NetworkDefinition = decode(p["network"].clone())?;
                let node = field(&p, "output_node_id")?;
                ensure!(
                    n.nodes.iter().any(|n| n.id == node),
                    "Choose an existing output node"
                );
                let pointer = p["pointer"].as_str().unwrap_or("");
                ensure!(
                    pointer.is_empty() || pointer.starts_with('/'),
                    "JSON pointer must be empty or start with /"
                );
                let review =
                    runtime::review(self, compile(&n, p["revision"].as_i64().unwrap_or(0))?)
                        .await?;
                let run = runtime::create(
                    &self.store,
                    review,
                    p["input"].clone(),
                    field(&p, "approval_digest")?,
                )?;
                self.store.write(&key("test",&run.id),0,&json!({"id":run.id,"run_id":run.id,"network_id":n.id,"approval_digest":run.review.approval_digest,"output_node_id":node,"pointer":pointer,"expected":p["expected"]}))?;
                runtime::execute(
                    self.store.clone(),
                    Arc::new(self.clone()),
                    &run.id,
                    vec![],
                    vec![],
                )
                .await?;
                self.test_result(&run.id)
            }
            "next_authoring_test_result" => self.test_result(field(&p, "run_id")?),
            _ => bail!("Unknown authoring action"),
        }
    }
    fn test_result(&self, id: &str) -> Result<Value> {
        runtime::recover_interrupted(&self.store)?;
        let t = self.next_get::<Value>("test", id)?.value;
        let run = self.next_get::<runtime::Run>("run", id)?.value;
        let state = run.nodes.get(field(&t, "output_node_id")?);
        let actual = state
            .and_then(|s| s.output.pointer(t["pointer"].as_str().unwrap_or("")))
            .cloned();
        let status = if run.status != "completed" {
            run.status.clone()
        } else if state.is_some_and(|s| s.state == "completed")
            && actual.as_ref() == Some(&t["expected"])
        {
            "passed".into()
        } else {
            "failed".into()
        };
        Ok(
            json!({"run_id":id,"status":status,"run_status":run.status,"actual":actual,"expected":t["expected"],"output_node_id":t["output_node_id"],"pointer":t["pointer"],"message":"This result covers only this sample and the reviewed graph/resources. It does not prove general correctness."}),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn readiness_distinguishes_binding_failure_and_weak_contract() {
        let d = tempfile::tempdir().unwrap();
        let e = Engine::new(consilium_storage::Store::new(d.path().into()).unwrap());
        let file = d.path().join("notes.md");
        std::fs::write(&file, "unrelated").unwrap();
        e.store
            .write(
                &key("binding", "wrong"),
                0,
                &json!({"id":"wrong","name":"notes.md","kind":"file","path":file,"writable":false}),
            )
            .unwrap();
        let n = json!({"schema_version":1,"id":"n","name":"Bad","nodes":[{"id":"input","kind":"input","title":"Input","config":{}},{"id":"p","kind":"process","title":"Pretend","config":{"executable_binding":"wrong","source":"print('success')","extension":"py"}},{"id":"v","kind":"validate","title":"Weak","config":{"schema":{"type":"object"}}}],"edges":[{"id":"e","source":"input","target":"p"},{"id":"e2","source":"p","target":"v"}]});
        let r = e
            .authoring_action("next_authoring_readiness", json!({"network":n}))
            .await
            .unwrap();
        assert_eq!(r["structure_valid"], true);
        assert_eq!(r["resources_ready"], false);
        assert_eq!(r["warnings"].as_array().unwrap().len(), 2);
        assert!(e.check_authoring_bindings(&decode(n).unwrap()).is_err());
    }
    #[tokio::test]
    async fn sample_tests_require_review_and_compare_real_output() {
        let d = tempfile::tempdir().unwrap();
        let e = Engine::new(consilium_storage::Store::new(d.path().into()).unwrap());
        let n = json!({"schema_version":1,"id":"n","name":"Identity","nodes":[{"id":"in","kind":"input","title":"Input","config":{}},{"id":"out","kind":"output","title":"Output","config":{}}],"edges":[{"id":"edge","source":"in","target":"out"}]});
        let review = e
            .authoring_action("next_authoring_review", json!({"network":n}))
            .await
            .unwrap();
        let mut p = json!({"network":n,"input":{"answer":42},"expected":42,"pointer":"/answer","output_node_id":"out","approval_digest":review["approval_digest"]});
        assert!(e
            .authoring_action("next_authoring_test", p.clone())
            .await
            .is_err());
        p["approved"] = json!(true);
        assert_eq!(
            e.authoring_action("next_authoring_test", p.clone())
                .await
                .unwrap()["status"],
            "passed"
        );
        p["expected"] = json!(43);
        assert_eq!(
            e.authoring_action("next_authoring_test", p).await.unwrap()["status"],
            "failed"
        );
        assert!(
            e.next_get::<Value>("network", "n").is_err(),
            "Testing a proposal must not apply its graph"
        );
    }
    #[tokio::test]
    async fn sample_approval_and_changed_graph_require_review() {
        let d = tempfile::tempdir().unwrap();
        let e = Engine::new(consilium_storage::Store::new(d.path().into()).unwrap());
        let n = json!({"schema_version":1,"id":"g","name":"Approval sample","nodes":[{"id":"in","kind":"input","title":"Input","config":{}},{"id":"gate","kind":"approval","title":"Review","config":{}},{"id":"out","kind":"output","title":"Output","config":{}}],"edges":[{"id":"a","source":"in","target":"gate"},{"id":"b","source":"gate","target":"out"}]});
        let review = e
            .authoring_action("next_authoring_review", json!({"network":n}))
            .await
            .unwrap();
        let p = json!({"network":n,"approved":true,"input":{"a":1},"expected":{"a":1},"output_node_id":"out","approval_digest":review["approval_digest"]});
        let result = e
            .authoring_action("next_authoring_test", p.clone())
            .await
            .unwrap();
        assert_eq!(result["status"], "awaiting_approval");
        let id = result["run_id"].as_str().unwrap();
        runtime::execute(
            e.store.clone(),
            Arc::new(e.clone()),
            id,
            vec!["gate".into()],
            vec![],
        )
        .await
        .unwrap();
        assert_eq!(e.test_result(id).unwrap()["status"], "passed");
        let mut edited = p;
        edited["network"]["nodes"][0]["config"] = json!({"value":{"a":2}});
        assert!(
            e.authoring_action("next_authoring_test", edited.clone())
                .await
                .is_err(),
            "Changed graph invalidates previous approval"
        );
        let checks = e
            .authoring_action(
                "next_authoring_readiness",
                json!({"network":edited["network"]}),
            )
            .await
            .unwrap();
        assert_eq!(checks["tests"][0]["current_revision"], false);
    }
}
