use anyhow::{bail, Result};
use async_trait::async_trait;
use consilium_storage::Store;
use consilium_workflow::{runtime::*, *};
use serde_json::{json, Value};
use std::sync::Arc;
struct HostStub;
#[async_trait]
impl Host for HostStub {
    async fn resources(&self, _: &CompiledPlan) -> Result<Value> {
        Ok(json!({}))
    }
    async fn execute(
        &self,
        node: &Node,
        input: Value,
        _: &Value,
        _: &str,
        _: Arc<CallBudget>,
    ) -> Result<Value> {
        if node.title == "fail" {
            bail!("Synthetic failure");
        }
        if node.title == "slow" {
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
        }
        Ok(input)
    }
}
fn node(id: &str, kind: &str, config: Value) -> Node {
    Node {
        id: id.into(),
        kind: kind.into(),
        title: id.into(),
        config,
        position: Position::default(),
    }
}
fn edge(source: &str, target: &str, port: &str) -> Edge {
    Edge {
        id: format!("{source}-{target}"),
        source: source.into(),
        target: target.into(),
        source_port: port.into(),
        target_port: "in".into(),
    }
}
fn network(nodes: Vec<Node>, edges: Vec<Edge>) -> NetworkDefinition {
    NetworkDefinition {
        schema_version: 1,
        id: "test".into(),
        name: "Test".into(),
        nodes,
        edges,
        limits: Limits::default(),
    }
}
async fn start(store: &Store, n: NetworkDefinition) -> Run {
    let review = review(&HostStub, compile(&n, 1).unwrap()).await.unwrap();
    let digest = review.approval_digest.clone();
    create(store, review, json!({"valid":true}), &digest).unwrap()
}
#[tokio::test]
async fn conditional_join_skips_inactive_branch() {
    let dir = tempfile::tempdir().unwrap();
    let s = Store::new(dir.path().into()).unwrap();
    let n = network(
        vec![
            node("input", "input", json!({})),
            node(
                "branch",
                "condition",
                json!({"pointer":"/valid","equals":true}),
            ),
            node("yes", "parallel", json!({})),
            node("no", "parallel", json!({})),
            node("join", "join", json!({})),
            node("out", "output", json!({})),
        ],
        vec![
            edge("input", "branch", "out"),
            edge("branch", "yes", "true"),
            edge("branch", "no", "false"),
            edge("yes", "join", "out"),
            edge("no", "join", "out"),
            edge("join", "out", "out"),
        ],
    );
    let r = start(&s, n).await;
    let r = execute(s, Arc::new(HostStub), &r.id, vec![], vec![])
        .await
        .unwrap();
    assert_eq!(r.status, "completed");
    assert_eq!(r.nodes["no"].state, "skipped");
    assert_eq!(r.nodes["out"].output, json!({"valid":true}));
}
#[tokio::test]
async fn approvals_pause_and_resume_without_repeating_completed_nodes() {
    let dir = tempfile::tempdir().unwrap();
    let s = Store::new(dir.path().into()).unwrap();
    let n = network(
        vec![
            node("in", "input", json!({})),
            node("approve", "approval", json!({})),
            node("out", "output", json!({})),
        ],
        vec![edge("in", "approve", "out"), edge("approve", "out", "out")],
    );
    let r = start(&s, n).await;
    let r = execute(s.clone(), Arc::new(HostStub), &r.id, vec![], vec![])
        .await
        .unwrap();
    assert_eq!(r.status, "awaiting_approval");
    assert_eq!(r.nodes["approve"].output, json!({"valid":true}));
    let r = execute(s, Arc::new(HostStub), &r.id, vec!["approve".into()], vec![])
        .await
        .unwrap();
    assert_eq!(r.status, "completed");
    assert_eq!(r.nodes["in"].attempts, 1);
}
#[tokio::test]
async fn interrupted_steps_require_explicit_retry() {
    let dir = tempfile::tempdir().unwrap();
    let s = Store::new(dir.path().into()).unwrap();
    let n = network(
        vec![
            node("in", "input", json!({})),
            node("out", "output", json!({})),
        ],
        vec![edge("in", "out", "out")],
    );
    let mut r = start(&s, n).await;
    r.nodes.get_mut("in").unwrap().state = "running".into();
    s.write(&format!("next:run:{}", r.id), 1, &r).unwrap();
    let r = execute(s.clone(), Arc::new(HostStub), &r.id, vec![], vec![])
        .await
        .unwrap();
    assert_eq!(r.status, "interrupted");
    let r = execute(s, Arc::new(HostStub), &r.id, vec![], vec!["in".into()])
        .await
        .unwrap();
    assert_eq!(r.status, "completed");
}
#[tokio::test]
async fn loop_limit_is_enforced() {
    let dir = tempfile::tempdir().unwrap();
    let s = Store::new(dir.path().into()).unwrap();
    let body = network(
        vec![
            node("in", "input", json!({})),
            node("out", "output", json!({})),
        ],
        vec![edge("in", "out", "out")],
    );
    let n = network(
        vec![
            node("in", "input", json!({})),
            node(
                "loop",
                "loop",
                json!({"body":body,"max_iterations":2,"stop_pointer":"/valid","stop_equals":false}),
            ),
            node("out", "output", json!({})),
        ],
        vec![edge("in", "loop", "out"), edge("loop", "out", "out")],
    );
    let r = start(&s, n).await;
    let r = execute(s, Arc::new(HostStub), &r.id, vec![], vec![])
        .await
        .unwrap();
    assert_eq!(r.status, "failed");
    assert!(r.nodes["loop"].error.contains("iteration limit"));
}
#[tokio::test]
async fn native_process_json_and_failure() {
    let executable = std::path::Path::new("C:\\Program Files\\nodejs\\node.exe");
    if !executable.exists() {
        return;
    }
    let dir = tempfile::tempdir().unwrap();
    let value=process::execute(executable,&[],"let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>console.log(JSON.stringify({total:JSON.parse(s).values.reduce((a,b)=>a+b,0)})));","js",&json!({"values":[2,3,5]}),dir.path()).await.unwrap();
    assert_eq!(value["total"], 10);
    assert!(process::execute(
        executable,
        &[],
        "process.exit(7)",
        "js",
        &json!({}),
        dir.path()
    )
    .await
    .is_err());
}

#[tokio::test]
async fn cancelled_run_preserves_completed_steps_and_requires_retry() {
    let dir = tempfile::tempdir().unwrap();
    let s = Store::new(dir.path().into()).unwrap();
    let mut slow = node(
        "slow",
        "process",
        json!({"executable_binding":"stub","source":"stub"}),
    );
    slow.title = "slow".into();
    let n = network(
        vec![
            node("in", "input", json!({})),
            slow,
            node("out", "output", json!({})),
        ],
        vec![edge("in", "slow", "out"), edge("slow", "out", "out")],
    );
    let r = start(&s, n).await;
    let cancel_store = s.clone();
    let id = r.id.clone();
    let cancel_task = tokio::spawn(async move {
        loop {
            if cancel_store
                .read::<Run>(&format!("next:run:{id}"))
                .unwrap()
                .unwrap()
                .value
                .nodes["slow"]
                .state
                == "running"
            {
                cancel(&cancel_store, &id).unwrap();
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
    });
    let r = execute(s.clone(), Arc::new(HostStub), &r.id, vec![], vec![])
        .await
        .unwrap();
    cancel_task.await.unwrap();
    assert_eq!(r.status, "cancelled");
    assert_eq!(r.nodes["slow"].state, "interrupted");
    assert_eq!(r.nodes["in"].attempts, 1);
    let r = execute(s, Arc::new(HostStub), &r.id, vec![], vec![])
        .await
        .unwrap();
    assert_eq!(r.status, "interrupted");
}
#[tokio::test]
async fn loop_retry_reuses_completed_nested_writes() {
    use std::sync::atomic::{AtomicUsize, Ordering};
    struct Once {
        writes: AtomicUsize,
        failures: AtomicUsize,
    }
    #[async_trait]
    impl Host for Once {
        async fn resources(&self, _: &CompiledPlan) -> Result<Value> {
            Ok(json!({}))
        }
        async fn execute(
            &self,
            n: &Node,
            v: Value,
            _: &Value,
            _: &str,
            _: Arc<CallBudget>,
        ) -> Result<Value> {
            if n.title == "write" {
                self.writes.fetch_add(1, Ordering::SeqCst);
            }
            if n.title == "fail-once" && self.failures.fetch_add(1, Ordering::SeqCst) == 0 {
                bail!("Synthetic first failure");
            }
            Ok(v)
        }
    }
    let dir = tempfile::tempdir().unwrap();
    let s = Store::new(dir.path().into()).unwrap();
    let body = network(
        vec![
            node("in", "input", json!({})),
            node("write", "file_write", json!({"binding_id":"stub"})),
            node("fail-once", "file_write", json!({"binding_id":"stub"})),
            node("out", "output", json!({})),
        ],
        vec![
            edge("in", "write", "out"),
            edge("write", "fail-once", "out"),
            edge("fail-once", "out", "out"),
        ],
    );
    let n = network(
        vec![
            node("in", "input", json!({})),
            node(
                "loop",
                "loop",
                json!({"body":body,"max_iterations":2,"stop_pointer":"/valid","stop_equals":true}),
            ),
            node("out", "output", json!({})),
        ],
        vec![edge("in", "loop", "out"), edge("loop", "out", "out")],
    );
    let r = start(&s, n).await;
    let host = Arc::new(Once {
        writes: AtomicUsize::new(0),
        failures: AtomicUsize::new(0),
    });
    let r = execute(s.clone(), host.clone(), &r.id, vec![], vec![])
        .await
        .unwrap();
    assert_eq!(r.status, "failed");
    assert_eq!(r.nested_steps["loop/0/write"].node.state, "completed");
    let r = execute(s, host.clone(), &r.id, vec![], vec!["loop".into()])
        .await
        .unwrap();
    assert_eq!(r.status, "completed");
    assert_eq!(host.writes.load(Ordering::SeqCst), 1);
    assert_eq!(r.nested_steps["loop/0/fail-once"].node.attempts, 2);
}
#[tokio::test]
async fn dead_runner_is_reported_interrupted_without_execution() {
    let dir = tempfile::tempdir().unwrap();
    let s = Store::new(dir.path().into()).unwrap();
    let n = network(
        vec![
            node("in", "input", json!({})),
            node("out", "output", json!({})),
        ],
        vec![edge("in", "out", "out")],
    );
    let mut r = start(&s, n).await;
    r.status = "running".into();
    r.nodes.get_mut("in").unwrap().state = "running".into();
    s.write(&format!("next:run:{}", r.id), 1, &r).unwrap();
    recover_interrupted(&s).unwrap();
    let r = s
        .read::<Run>(&format!("next:run:{}", r.id))
        .unwrap()
        .unwrap()
        .value;
    assert_eq!(r.status, "interrupted");
    assert_eq!(r.nodes["in"].state, "interrupted");
    assert_eq!(r.nodes["out"].attempts, 0);
}
#[tokio::test]
async fn model_budget_persists_and_counts_each_attempt() {
    struct BudgetHost;
    #[async_trait]
    impl Host for BudgetHost {
        async fn resources(&self, _: &CompiledPlan) -> Result<Value> {
            Ok(json!({}))
        }
        async fn execute(
            &self,
            _: &Node,
            v: Value,
            _: &Value,
            _: &str,
            budget: Arc<CallBudget>,
        ) -> Result<Value> {
            budget.consume()?;
            budget.consume()?;
            Ok(v)
        }
    }
    let dir = tempfile::tempdir().unwrap();
    let s = Store::new(dir.path().into()).unwrap();
    let mut n = network(
        vec![
            node("in", "input", json!({})),
            node(
                "agent",
                "agent",
                json!({"profile_id":"stub","system_prompt":"test"}),
            ),
            node("out", "output", json!({})),
        ],
        vec![edge("in", "agent", "out"), edge("agent", "out", "out")],
    );
    n.limits.model_calls = 1;
    let r = start(&s, n).await;
    let r = execute(s.clone(), Arc::new(BudgetHost), &r.id, vec![], vec![])
        .await
        .unwrap();
    assert_eq!(r.status, "failed");
    assert_eq!(r.model_calls, 1);
    let r = execute(s, Arc::new(BudgetHost), &r.id, vec![], vec!["agent".into()])
        .await
        .unwrap();
    assert_eq!(r.model_calls, 1);
    assert!(r.nodes["agent"].error.contains("limit"));
}
