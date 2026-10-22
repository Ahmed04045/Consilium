use super::*;
use async_trait::async_trait;
use consilium_domain::{id, now};
use consilium_storage::Store;
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};
pub struct CallBudget {
    store: Store,
    key: String,
    max: usize,
    gate: Mutex<()>,
}
impl CallBudget {
    pub fn consume(&self) -> Result<()> {
        let _guard = self
            .gate
            .lock()
            .map_err(|_| anyhow::anyhow!("Model budget is busy"))?;
        let previous = self.store.read::<usize>(&self.key)?;
        let used = previous.as_ref().map_or(0, |r| r.value);
        ensure!(
            used < self.max,
            "Model call limit reached (including retries and repairs)"
        );
        self.store
            .write(&self.key, previous.map_or(0, |r| r.revision), &(used + 1))?;
        Ok(())
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RunEvent {
    pub at: String,
    pub node_id: Option<String>,
    pub state: String,
    pub detail: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NodeState {
    pub state: String,
    pub attempts: u32,
    pub output: Value,
    pub port: String,
    pub error: String,
}
impl Default for NodeState {
    fn default() -> Self {
        Self {
            state: "pending".into(),
            attempts: 0,
            output: Value::Null,
            port: "out".into(),
            error: String::new(),
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Review {
    pub plan: CompiledPlan,
    pub resources: Value,
    pub approval_digest: String,
    pub warning: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Run {
    pub id: String,
    pub network_id: String,
    pub status: String,
    pub review: Review,
    pub input: Value,
    pub nodes: BTreeMap<String, NodeState>,
    pub events: Vec<RunEvent>,
    pub approved_nodes: Vec<String>,
    pub started_at: String,
    pub model_calls: usize,
    #[serde(default)]
    pub nested_steps: BTreeMap<String, NestedStep>,
    #[serde(default)]
    pub elapsed_ms: u64,
    #[serde(default)]
    pub active_started_ms: Option<u64>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NestedStep {
    pub path: String,
    pub identity: String,
    pub node: NodeState,
}
#[async_trait]
pub trait Host: Send + Sync {
    async fn resources(&self, plan: &CompiledPlan) -> Result<Value>;
    async fn execute(
        &self,
        node: &Node,
        input: Value,
        resources: &Value,
        run_id: &str,
        budget: Arc<CallBudget>,
    ) -> Result<Value>;
}
pub async fn review(host: &dyn Host, plan: CompiledPlan) -> Result<Review> {
    let resources = host.resources(&plan).await?;
    let approval_digest = digest(&(&plan.digest, &resources))?;
    Ok(Review{plan,resources,approval_digest,warning:"Native scripts execute with your Windows user permissions. This is trusted-code execution, not filesystem or network isolation. Review scripts, model destinations, resource bindings and writes before running.".into()})
}
pub fn create(store: &Store, review: Review, input: Value, approved: &str) -> Result<Run> {
    ensure!(
        approved == review.approval_digest,
        "Review this exact graph and bindings before running"
    );
    let run = Run {
        id: id(),
        network_id: review.plan.network.id.clone(),
        status: "queued".into(),
        nodes: review
            .plan
            .network
            .nodes
            .iter()
            .map(|n| (n.id.clone(), NodeState::default()))
            .collect(),
        review,
        input,
        events: vec![],
        approved_nodes: vec![],
        started_at: now(),
        model_calls: 0,
        nested_steps: BTreeMap::new(),
        elapsed_ms: 0,
        active_started_ms: None,
    };
    store.write(&format!("next:run:{}", run.id), 0, &run)?;
    Ok(run)
}
fn save(store: &Store, run: &mut Run, revision: &mut i64) -> Result<()> {
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_millis() as u64;
    if let Some(start) = run.active_started_ms {
        run.elapsed_ms = run.elapsed_ms.saturating_add(now_ms.saturating_sub(start));
    }
    run.active_started_ms = if run.status == "running" {
        Some(now_ms)
    } else {
        None
    };
    run.model_calls = store
        .read::<usize>(&format!("next:budget:{}", run.id))?
        .map_or(run.model_calls, |r| r.value);
    run.nested_steps = store
        .list::<NestedStep>(&format!("next:step:{}:", run.id))?
        .into_iter()
        .map(|r| (r.value.path.clone(), r.value))
        .collect();
    *revision = store.write(&format!("next:run:{}", run.id), *revision, run)?;
    Ok(())
}
fn event(run: &mut Run, node: Option<String>, state: &str, detail: &str) {
    run.events.push(RunEvent {
        at: now(),
        node_id: node,
        state: state.into(),
        detail: detail.into(),
    });
}
pub fn cancel(store: &Store, id: &str) -> Result<()> {
    let key = format!("next:cancel:{id}");
    let rev = store.read::<Value>(&key)?.map_or(0, |r| r.revision);
    store.write(&key, rev, &json!({"cancelled":true}))?;
    Ok(())
}
pub fn recover_interrupted(store: &Store) -> Result<()> {
    for record in store.list::<Run>("next:run:")? {
        let mut run = record.value;
        if run.status != "running" {
            continue;
        }
        let lease = store.read::<Value>(&format!("next:lease:{}", run.id))?;
        if lease.is_some_and(|r| process::is_alive(r.value["pid"].as_u64().unwrap_or(0) as u32)) {
            continue;
        }
        for state in run.nodes.values_mut().filter(|s| s.state == "running") {
            state.state = "interrupted".into();
        }
        run.status = "interrupted".into();
        event(
            &mut run,
            None,
            "interrupted",
            "The previous runner stopped. Review uncertain steps before explicitly retrying.",
        );
        // A racing recovery in another window is harmless; its revision wins.
        let mut revision = record.revision;
        let _ = save(store, &mut run, &mut revision);
    }
    Ok(())
}
async fn cancelled(store: Store, id: String) {
    loop {
        if store
            .read::<Value>(&format!("next:cancel:{id}"))
            .ok()
            .flatten()
            .is_some_and(|r| r.value["cancelled"] == true)
        {
            return;
        }
        tokio::time::sleep(Duration::from_millis(150)).await;
    }
}
pub async fn execute(
    store: Store,
    host: Arc<dyn Host>,
    run_id: &str,
    approved_nodes: Vec<String>,
    retry_nodes: Vec<String>,
) -> Result<Run> {
    // A cross-process lease prevents simultaneous desktop/CLI runners owning the same run.
    let lease_key = format!("next:lease:{run_id}");
    let old = store.read::<Value>(&lease_key)?;
    if let Some(old) = &old {
        let pid = old.value["pid"].as_u64().unwrap_or(0) as u32;
        ensure!(
            !process::is_alive(pid),
            "This run is already owned by a running process"
        );
    }
    store.write(
        &lease_key,
        old.map_or(0, |r| r.revision),
        &json!({"pid":std::process::id()}),
    )?;
    let result = execute_owned(store.clone(), host, run_id, approved_nodes, retry_nodes).await;
    if let Some(record) = store.read::<Value>(&lease_key)? {
        store.write(&lease_key, record.revision, &json!({"pid":0}))?;
    }
    result
}
async fn execute_owned(
    store: Store,
    host: Arc<dyn Host>,
    run_id: &str,
    approved_nodes: Vec<String>,
    retry_nodes: Vec<String>,
) -> Result<Run> {
    let record = store
        .read::<Run>(&format!("next:run:{run_id}"))?
        .context("Run not found")?;
    let mut revision = record.revision;
    let mut run = record.value;
    ensure!(run.status != "completed", "Run is complete");
    ensure!(
        compile(&run.review.plan.network, run.review.plan.revision)?.digest
            == run.review.plan.digest,
        "Compiled graph was modified"
    );
    if let Some(flag) = store.read::<Value>(&format!("next:cancel:{run_id}"))? {
        store.write(
            &format!("next:cancel:{run_id}"),
            flag.revision,
            &json!({"cancelled":false}),
        )?;
    }
    ensure!(
        digest(&(&run.review.plan.digest, &run.review.resources))? == run.review.approval_digest,
        "Run review was modified"
    );
    for (id, state) in &mut run.nodes {
        if state.state == "running" {
            state.state = "interrupted".into();
        }
        if retry_nodes.contains(id) && ["failed", "interrupted"].contains(&state.state.as_str()) {
            state.state = "pending".into();
        }
    }
    if run.nodes.values().any(|s| s.state == "interrupted") {
        run.status = "interrupted".into();
        event(&mut run,None,"interrupted","Review uncertain steps and explicitly select any step to retry. Completed writes are preserved.");
        save(&store, &mut run, &mut revision)?;
        return Ok(run);
    }
    run.approved_nodes.extend(approved_nodes);
    if run.elapsed_ms >= run.review.plan.network.limits.timeout_seconds * 1000 {
        run.status = "interrupted".into();
        event(
            &mut run,
            None,
            "interrupted",
            "The run time budget is exhausted. Start a new reviewed run to continue.",
        );
        save(&store, &mut run, &mut revision)?;
        return Ok(run);
    }
    run.status = "running".into();
    save(&store, &mut run, &mut revision)?;
    let deadline = tokio::time::Instant::now()
        + Duration::from_millis(
            (run.review.plan.network.limits.timeout_seconds * 1000).saturating_sub(run.elapsed_ms),
        );
    let calls = Arc::new(CallBudget {
        store: store.clone(),
        key: format!("next:budget:{}", run.id),
        max: run.review.plan.network.limits.model_calls,
        gate: Mutex::new(()),
    });
    loop {
        let graph = &run.review.plan.network;
        let mut ready = vec![];
        let mut skipped = vec![];
        for id in &run.review.plan.order {
            if run.nodes[id].state != "pending" {
                continue;
            }
            let edges: Vec<_> = graph.edges.iter().filter(|e| e.target == *id).collect();
            if edges
                .iter()
                .any(|e| !["completed", "skipped"].contains(&run.nodes[&e.source].state.as_str()))
            {
                continue;
            }
            let values: Vec<Value> = edges
                .iter()
                .filter(|e| {
                    run.nodes[&e.source].state == "completed"
                        && run.nodes[&e.source].port == e.source_port
                })
                .map(|e| run.nodes[&e.source].output.clone())
                .collect();
            if !edges.is_empty() && values.is_empty() {
                skipped.push(id.clone());
                continue;
            }
            let input = if edges.is_empty() {
                run.input.clone()
            } else if values.len() == 1 {
                values[0].clone()
            } else {
                json!(values)
            };
            ready.push((
                graph.nodes.iter().find(|n| n.id == *id).unwrap().clone(),
                input,
            ));
        }
        let skipped_any = !skipped.is_empty();
        for id in skipped {
            run.nodes.get_mut(&id).unwrap().state = "skipped".into();
        }
        if ready.is_empty() {
            if skipped_any {
                save(&store, &mut run, &mut revision)?;
                continue;
            }
            run.status = if run
                .nodes
                .values()
                .all(|s| ["completed", "skipped"].contains(&s.state.as_str()))
            {
                "completed"
            } else {
                "failed"
            }
            .into();
            let status = run.status.clone();
            event(&mut run, None, &status, "Run stopped");
            save(&store, &mut run, &mut revision)?;
            return Ok(run);
        }
        ready.truncate(run.review.plan.network.limits.concurrency);
        // Do not start sibling side effects before a pending approval has been reviewed.
        if let Some((node, input)) = ready
            .iter()
            .find(|(node, _)| node.kind == "approval" && !run.approved_nodes.contains(&node.id))
        {
            let id = node.id.clone();
            run.nodes.get_mut(&id).unwrap().output = input.clone();
            run.status = "awaiting_approval".into();
            event(
                &mut run,
                Some(id),
                "awaiting_approval",
                "Review the pending input before continuing",
            );
            save(&store, &mut run, &mut revision)?;
            return Ok(run);
        }
        let mut jobs = tokio::task::JoinSet::new();
        for (node, input) in ready {
            if node.kind == "approval" && !run.approved_nodes.contains(&node.id) {
                run.status = "awaiting_approval".into();
                event(
                    &mut run,
                    Some(node.id),
                    "awaiting_approval",
                    "Review the input before continuing",
                );
                save(&store, &mut run, &mut revision)?;
                return Ok(run);
            }
            let state = run.nodes.get_mut(&node.id).unwrap();
            state.state = "running".into();
            state.attempts += 1;
            event(&mut run, Some(node.id.clone()), "running", "");
            let host = host.clone();
            let resources = run.review.resources.clone();
            let limits = run.review.plan.network.limits.clone();
            let run_id = run.id.clone();
            let calls = calls.clone();
            let step_store = store.clone();
            jobs.spawn(async move {
                let timeout = if node.kind == "process" {
                    node.config["timeout_seconds"]
                        .as_u64()
                        .unwrap_or(300)
                        .min(1800)
                } else if node.kind == "loop" {
                    limits.timeout_seconds
                } else {
                    120
                };
                let result = tokio::time::timeout(
                    Duration::from_secs(timeout),
                    eval(
                        host,
                        node.clone(),
                        input,
                        resources,
                        run_id,
                        limits,
                        calls,
                        step_store,
                        node.id.clone(),
                    ),
                )
                .await
                .map_err(|_| anyhow::anyhow!("Node timed out; review side effects before retrying"))
                .and_then(|r| r);
                (node.id, result)
            });
        }
        save(&store, &mut run, &mut revision)?;
        while !jobs.is_empty() {
            tokio::select! {
                _=cancelled(store.clone(),run.id.clone())=>{jobs.abort_all();while jobs.join_next().await.is_some(){}for state in run.nodes.values_mut().filter(|s|s.state=="running"){state.state="interrupted".into();}run.status="cancelled".into();event(&mut run,None,"cancelled","Running steps were interrupted; uncertain side effects require review");save(&store,&mut run,&mut revision)?;return Ok(run);},
                _=tokio::time::sleep_until(deadline)=>{jobs.abort_all();while jobs.join_next().await.is_some(){}for state in run.nodes.values_mut().filter(|s|s.state=="running"){state.state="interrupted".into();}run.status="interrupted".into();event(&mut run,None,"interrupted","Run time limit reached");save(&store,&mut run,&mut revision)?;return Ok(run);},
                result=jobs.join_next()=>{let (id,result)=result.context("Missing node result")??;let state=run.nodes.get_mut(&id).unwrap();match result{Ok((output,port))=>{if output.to_string().len()>2_000_000{state.state="failed".into();state.error="Node output exceeds 2 MB".into();}else{state.state="completed".into();state.output=output;state.port=port;}},Err(e)=>{state.state="failed".into();state.error=e.to_string();}}let state=run.nodes[&id].clone();event(&mut run,Some(id),&state.state,&state.error);save(&store,&mut run,&mut revision)?;}
            }
        }
    }
}
fn eval(
    host: Arc<dyn Host>,
    node: Node,
    input: Value,
    resources: Value,
    run_id: String,
    limits: Limits,
    calls: Arc<CallBudget>,
    store: Store,
    path: String,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(Value, String)>> + Send>> {
    Box::pin(async move {
        let output = match node.kind.as_str() {
            "input" => node.config.get("value").cloned().unwrap_or(input),
            "output" | "parallel" | "join" | "approval" => input,
            "condition" => {
                let observed = if let Some(pointer) = node.config["pointer"].as_str() {
                    input.pointer(pointer).cloned().unwrap_or(Value::Null)
                } else {
                    input.clone()
                };
                return Ok((
                    input,
                    if observed == node.config["equals"] {
                        "true"
                    } else {
                        "false"
                    }
                    .into(),
                ));
            }
            "validate" => {
                ensure!(
                    jsonschema::is_valid(&node.config["schema"], &input),
                    "Output failed JSON schema validation"
                );
                input
            }
            "loop" => {
                let body: NetworkDefinition = serde_json::from_value(node.config["body"].clone())?;
                let plan = compile(&body, 1)?;
                let mut value = input;
                let max = node.config["max_iterations"].as_u64().unwrap_or(5) as usize;
                let mut stopped = false;
                for iteration in 0..max.min(limits.iterations) {
                    let mut outputs: BTreeMap<String, (Value, String)> = BTreeMap::new();
                    for id in &plan.order {
                        let n = body.nodes.iter().find(|n| n.id == *id).unwrap();
                        let edges: Vec<_> = body.edges.iter().filter(|e| e.target == *id).collect();
                        let inputs: Vec<_> = edges
                            .iter()
                            .filter_map(|e| {
                                outputs
                                    .get(&e.source)
                                    .filter(|(_, port)| port == &e.source_port)
                                    .map(|(v, _)| v.clone())
                            })
                            .collect();
                        if !edges.is_empty() && inputs.is_empty() {
                            continue;
                        }
                        ensure!(
                            n.kind != "approval",
                            "Loop approvals must be placed before the loop"
                        );
                        let v = if edges.is_empty() {
                            value.clone()
                        } else if inputs.len() == 1 {
                            inputs[0].clone()
                        } else {
                            json!(inputs)
                        };
                        let step_path = format!("{path}/{iteration}/{}", n.id);
                        let step_key = format!("next:step:{run_id}:{}", digest(&step_path)?);
                        let identity = digest(&(n, &v))?;
                        let existing = store.read::<NestedStep>(&step_key)?;
                        let mut step =
                            existing
                                .as_ref()
                                .map(|r| r.value.clone())
                                .unwrap_or(NestedStep {
                                    path: step_path.clone(),
                                    identity: identity.clone(),
                                    node: NodeState::default(),
                                });
                        ensure!(
                            step.identity == identity,
                            "Nested step input changed; start a new run"
                        );
                        if step.node.state == "completed" {
                            outputs.insert(id.clone(), (step.node.output, step.node.port));
                            continue;
                        }
                        // Only an explicitly retried parent loop can reach an uncertain nested step.
                        step.node.state = "running".into();
                        step.node.attempts += 1;
                        step.node.error.clear();
                        let step_revision =
                            store.write(&step_key, existing.map_or(0, |r| r.revision), &step)?;
                        let mut execution_node = n.clone();
                        execution_node.id = format!("step-{}", digest(&step_path)?);
                        let timeout = if n.kind == "process" {
                            n.config["timeout_seconds"]
                                .as_u64()
                                .unwrap_or(300)
                                .min(1800)
                        } else if n.kind == "loop" {
                            limits.timeout_seconds
                        } else {
                            120
                        };
                        let result = tokio::time::timeout(
                            Duration::from_secs(timeout),
                            eval(
                                host.clone(),
                                execution_node,
                                v,
                                resources.clone(),
                                run_id.clone(),
                                limits.clone(),
                                calls.clone(),
                                store.clone(),
                                step_path,
                            ),
                        )
                        .await
                        .map_err(|_| {
                            anyhow::anyhow!(
                                "Nested step timed out; review side effects before retrying"
                            )
                        })
                        .and_then(|r| r);
                        match &result {
                            Ok((value, port)) => {
                                ensure!(
                                    value.to_string().len() <= 2_000_000,
                                    "Nested output exceeds 2 MB"
                                );
                                step.node.state = "completed".into();
                                step.node.output = value.clone();
                                step.node.port = port.clone();
                            }
                            Err(e) => {
                                step.node.state = "failed".into();
                                step.node.error = e.to_string();
                            }
                        }
                        store.write(&step_key, step_revision, &step)?;
                        let out = result?;
                        outputs.insert(id.clone(), out);
                    }
                    let last = body
                        .nodes
                        .iter()
                        .find(|n| n.kind == "output")
                        .and_then(|n| outputs.get(&n.id))
                        .context("Loop needs a reachable output node")?;
                    value = last.0.clone();
                    let observed = node.config["stop_pointer"]
                        .as_str()
                        .and_then(|p| value.pointer(p))
                        .unwrap_or(&value);
                    if *observed == node.config["stop_equals"] {
                        stopped = true;
                        break;
                    }
                }
                ensure!(
                    stopped,
                    "Loop reached its iteration limit before the stop condition"
                );
                value
            }
            "agent" => {
                host.execute(&node, input, &resources, &run_id, calls.clone())
                    .await?
            }
            _ => {
                host.execute(&node, input, &resources, &run_id, calls.clone())
                    .await?
            }
        };
        Ok((output, "out".into()))
    })
}
