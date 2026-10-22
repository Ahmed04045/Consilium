import { useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  applyNodeChanges,
  applyEdgeChanges,
  type ReactFlowInstance,
  type NodeProps,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Plus, Play, Save, Undo, Redo, Copy, Trash2 } from "lucide-react";
import { useWorkspace, row, call, Data, uid, download } from "./state";
const kinds = [
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
function GraphNode({ data, selected }: NodeProps) {
  const d = data as Data;
  return (
    <div className={`nx-graph-node ${selected ? "selected" : ""}`}>
      <Handle type="target" position={Position.Left} id="in" />
      <small>{d.kind.replaceAll("_", " ")}</small>
      <strong>{d.title}</strong>
      {d.group && <small>{d.group}</small>}
      {d.kind === "condition" ? (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="true"
            style={{ top: "35%" }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="false"
            style={{ top: "75%" }}
          />
        </>
      ) : (
        <Handle type="source" position={Position.Right} id="out" />
      )}
    </div>
  );
}
const nodeTypes = { workspace: GraphNode };
const defaults: Record<string, Data> = {
  input: { value: {} },
  agent: {
    profile_id: "",
    system_prompt:
      "Use supplied evidence. Return the requested output. Never invent sources.",
  },
  process: {
    executable_binding: "",
    extension: "py",
    source:
      "import sys, json\ndata = json.load(sys.stdin)\nprint(json.dumps(data))",
    args: [],
    timeout_seconds: 300,
  },
  file_read: { binding_id: "", format: "text" },
  folder_read: { binding_id: "" },
  file_write: { binding_id: "" },
  calendar_read: { calendar_id: "" },
  calendar_change: { calendar_id: "" },
  document_read: { document_id: "" },
  document_export: { document_id: "" },
  document_write: { title: "Workflow document", scope: "" },
  condition: { pointer: "/valid", equals: true },
  validate: { schema: { type: "object" } },
  loop: {
    max_iterations: 5,
    stop_pointer: "/approved",
    stop_equals: true,
    body: {
      schema_version: 1,
      id: "loop-body",
      name: "Revision loop",
      nodes: [
        {
          id: "input",
          kind: "input",
          title: "Input",
          config: {},
          position: { x: 0, y: 0 },
        },
        {
          id: "output",
          kind: "output",
          title: "Output",
          config: {},
          position: { x: 250, y: 0 },
        },
      ],
      edges: [
        {
          id: "edge",
          source: "input",
          target: "output",
          source_port: "out",
          target_port: "in",
        },
      ],
      limits: {
        concurrency: 2,
        iterations: 5,
        model_calls: 20,
        timeout_seconds: 1800,
      },
    },
  },
};
export function NetworkView({ id }: { id: string }) {
  const w = useWorkspace(),
    record = row(w.data, "network", id),
    [graph, setGraph] = useState<Data>(() =>
      structuredClone(record?.value || { nodes: [], edges: [], limits: {} }),
    ),
    [revision, setRevision] = useState(record?.revision || 0),
    [selected, setSelected] = useState(""),
    [config, setConfig] = useState("{}"),
    [filter, setFilter] = useState(""),
    [undo, setUndo] = useState<Data[]>([]),
    [redo, setRedo] = useState<Data[]>([]),
    [review, setReview] = useState<Data | null>(null),
    [trusted, setTrusted] = useState(false),
    [input, setInput] = useState("{}"),
    [running, setRunning] = useState(false),
    [validation, setValidation] = useState(""),
    [connectFrom, setConnectFrom] = useState(""),
    [connectTo, setConnectTo] = useState(""),
    [port, setPort] = useState("out"),
    [retry, setRetry] = useState<string[]>([]);
  const [measured,setMeasured]=useState<Record<string,{width?:number;height?:number}>>({});
  const [canvasQuery, setCanvasQuery] = useState(""),
    [multi, setMulti] = useState<string[]>([]),
    [groupName, setGroupName] = useState("");
  const flow = useRef<ReactFlowInstance<Node, Edge> | null>(null),
    dragStart = useRef<Data | null>(null);
  const selectedNode = graph.nodes.find((n: Data) => n.id === selected),
    runs = w.data.run
      .filter((r) => r.value.network_id === id)
      .slice()
      .reverse();
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => void w.refresh().catch(w.error), 750);
    return () => clearInterval(t);
  }, [running]);
  if (!record) return <p>Network not found.</p>;
  function change(next: Data) {
    setUndo([...undo.slice(-39), structuredClone(graph)]);
    setRedo([]);
    setGraph(next);
    setValidation("");
  }
  function select(id: string) {
    setSelected(id);
    setConfig(
      JSON.stringify(
        graph.nodes.find((n: Data) => n.id === id)?.config || {},
        null,
        2,
      ),
    );
  }
  async function save() {
    const r = await w.save("network", graph, revision);
    setRevision(r.revision);
    return r;
  }
  function node(kind: string) {
    const n = {
      id: uid(),
      kind,
      title: kind.replaceAll("_", " "),
      config: structuredClone(defaults[kind] || {}),
      position: {
        x: 100 + (graph.nodes.length % 3) * 260,
        y: 80 + Math.floor(graph.nodes.length / 3) * 140,
      },
    };
    change({ ...graph, nodes: [...graph.nodes, n] });
    setSelected(n.id);
    setConfig(JSON.stringify(n.config, null, 2));
  }
  const nodes: Node[] = graph.nodes.map((n: Data) => ({
    id: n.id,
    type: "workspace",
    position: n.position,
    measured:measured[n.id],
    data: { kind: n.kind, title: n.title, group: n.config.group || "" },
    selected: multi.includes(n.id) || n.id === selected,
  }));
  const edges: Edge[] = graph.edges.map((e: Data) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.source_port,
    targetHandle: e.target_port,
    label: e.source_port === "out" ? "" : e.source_port,
  }));
  function connect(
    source: string,
    target: string,
    sourceHandle = "out",
    targetHandle = "in",
  ) {
    if (!source || !target) return;
    change({
      ...graph,
      edges: [
        ...graph.edges,
        {
          id: uid(),
          source,
          target,
          source_port: sourceHandle,
          target_port: targetHandle,
        },
      ],
    });
  }
  async function prepare() {
    try {
      await save();
      const r = await call("next_network_review", { id });
      setReview(r);
      setTrusted(false);
    } catch (e) {
      w.error(e);
    }
  }
  async function run() {
    try {
      const payload = {
        network_id: id,
        revision: review!.plan.revision,
        approval_digest: review!.approval_digest,
        input: JSON.parse(input),
      };
      setReview(null);
      setRunning(true);
      await call("next_network_run", payload);
      await w.refresh();
    } catch (e) {
      w.error(e);
    } finally {
      setRunning(false);
    }
  }
  return (
    <div className="nx-network">
      <header className="nx-toolbar">
        <h1>{record.value.name}</h1>
        <input
          aria-label="Search this network"
          placeholder="Find in network"
          value={canvasQuery}
          onChange={(e) => setCanvasQuery(e.target.value)}
        />
        <button
          aria-label="Undo graph edit"
          disabled={!undo.length}
          onClick={() => {
            setRedo([graph, ...redo]);
            setGraph(undo.at(-1)!);
            setUndo(undo.slice(0, -1));
          }}
        >
          <Undo size={16} />
        </button>
        <button
          aria-label="Redo graph edit"
          disabled={!redo.length}
          onClick={() => {
            setUndo([...undo, graph]);
            setGraph(redo[0]);
            setRedo(redo.slice(1));
          }}
        >
          <Redo size={16} />
        </button>
        <span className="nx-spacer" />
        <button onClick={() => void save().catch(w.error)}>
          <Save size={16} />
          Save
        </button>
        <button
          onClick={() =>
            void call("next_network_validate", { network: graph, revision })
              .then(() =>
                setValidation(
                  "Graph is valid. Runtime bindings are checked during run review.",
                ),
              )
              .catch((e) => setValidation(String(e)))
          }
        >
          Validate
        </button>
        <button
          onClick={() =>
            void save()
              .then(() => call("next_network_export", { id }))
              .then((v) => download(`${record.value.name}.network.json`, v))
              .catch(w.error)
          }
        >
          Export graph & scripts
        </button>
        <button
          className="nx-primary"
          disabled={running}
          onClick={() => void prepare()}
        >
          <Play size={16} />
          Review & run
        </button>
      </header>
      {record.revision !== revision && (
        <div className="nx-validation">
          A newer revision is saved.{" "}
          <button
            onClick={() => {
              download("network-draft.json", graph);
              setGraph(structuredClone(record.value));
              setRevision(record.revision);
              setUndo([]);
              setRedo([]);
            }}
          >
            Keep draft copy and load saved revision
          </button>
        </div>
      )}
      {canvasQuery && (
        <div className="nx-actions">
          {graph.nodes
            .filter((n: Data) =>
              `${n.title} ${n.kind} ${n.config.group || ""}`
                .toLowerCase()
                .includes(canvasQuery.toLowerCase()),
            )
            .map((n: Data) => (
              <button
                key={n.id}
                onClick={() => {
                  select(n.id);
                  void flow.current?.fitView({
                    nodes: [{ id: n.id }],
                    duration: window.matchMedia(
                      "(prefers-reduced-motion: reduce)",
                    ).matches
                      ? 0
                      : 200,
                    maxZoom: 1,
                  });
                }}
              >
                {n.title}
              </button>
            ))}
        </div>
      )}
      {validation && (
        <div className="nx-validation" role="status">
          {validation}
        </div>
      )}
      <div className="nx-graph-layout">
        <aside className="nx-palette">
          <input
            aria-label="Find node type"
            placeholder="Find a node"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {kinds
            .filter((k) =>
              k.includes(filter.toLowerCase().replaceAll(" ", "_")),
            )
            .map((kind) => (
              <button key={kind} onClick={() => node(kind)}>
                <Plus size={12} />
                {kind.replaceAll("_", " ")}
              </button>
            ))}
          <button
            onClick={() =>
              w.open("assistant", `network:${id}`, "Network assistant")
            }
          >
            Design with AI
          </button>
        </aside>
        <div className="nx-canvas">
          <ReactFlow
            onInit={(instance) => {
              flow.current = instance;
            }}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={(_, n) => select(n.id)}
            onSelectionChange={({ nodes }) =>
              setMulti((previous) => {
                const ids = nodes.map((n) => n.id);
                return JSON.stringify(previous) === JSON.stringify(ids)
                  ? previous
                  : ids;
              })
            }
            onNodeDragStart={() => {
              dragStart.current = structuredClone(graph);
            }}
            onNodeDragStop={(_, node) => {
              const before = dragStart.current;
              if (!before) return;
              setUndo((previous) => [...previous.slice(-39), before]);
              setRedo([]);
              const origin = before.nodes.find((n: Data) => n.id === node.id);
              const group = origin?.config.group;
              if (group) {
                setGraph((current) => ({
                  ...current,
                  nodes: current.nodes.map((n: Data) =>
                    n.id !== node.id &&
                    n.config.group === group &&
                    !multi.includes(n.id)
                      ? {
                          ...n,
                          position: {
                            x:
                              before.nodes.find((x: Data) => x.id === n.id)
                                .position.x +
                              node.position.x -
                              origin.position.x,
                            y:
                              before.nodes.find((x: Data) => x.id === n.id)
                                .position.y +
                              node.position.y -
                              origin.position.y,
                          },
                        }
                      : n,
                  ),
                }));
              }
              dragStart.current = null;
            }}
            onNodesChange={(changes) => {
              const next = applyNodeChanges(changes, nodes);
              if(changes.some(c=>c.type==='dimensions'))setMeasured(previous=>({...previous,...Object.fromEntries(next.filter(n=>n.measured).map(n=>[n.id,n.measured!]))}));
              const update = {
                ...graph,
                nodes: next.map((n) => ({
                  ...graph.nodes.find((x: Data) => x.id === n.id),
                  position: n.position,
                })),
                edges: graph.edges.filter(
                  (e: Data) =>
                    next.some((n) => n.id === e.source) &&
                    next.some((n) => n.id === e.target),
                ),
              };
              if (changes.some((c) => c.type === "remove")) change(update);
              else setGraph(update);
            }}
            onEdgesChange={(changes) => {
              const next = applyEdgeChanges(changes, edges);
              if (changes.some((c) => c.type === "remove"))
                change({
                  ...graph,
                  edges: graph.edges.filter((e: Data) =>
                    next.some((n) => n.id === e.id),
                  ),
                });
            }}
            onConnect={(c) =>
              connect(
                c.source,
                c.target,
                c.sourceHandle || "out",
                c.targetHandle || "in",
              )
            }
            fitView
            colorMode="dark"
            deleteKeyCode="Delete"
          >
            <Background color="#393939" gap={24} />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>
        <aside className="nx-inspector">
          <details>
            <summary>
              Group selected nodes ({multi.length || (selected ? 1 : 0)})
            </summary>
            <label>
              Group name
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
              />
            </label>
            <button
              disabled={!selected && !multi.length}
              onClick={() =>
                change({
                  ...graph,
                  nodes: graph.nodes.map((n: Data) =>
                    (multi.length ? multi : [selected]).includes(n.id)
                      ? {
                          ...n,
                          config: { ...n.config, group: groupName.trim() },
                        }
                      : n,
                  ),
                })
              }
            >
              Apply group
            </button>
            <small>
              Shift-select nodes to group them. Drag a member to move the group.
              An empty name removes grouping.
            </small>
          </details>
          {selectedNode ? (
            <>
              <h2>Node</h2>
              <label>
                Title
                <input
                  value={selectedNode.title}
                  onChange={(e) =>
                    change({
                      ...graph,
                      nodes: graph.nodes.map((n: Data) =>
                        n.id === selected ? { ...n, title: e.target.value } : n,
                      ),
                    })
                  }
                />
              </label>
              {selectedNode.kind === "agent" && (
                <label>
                  Model profile
                  <select
                    value={selectedNode.config.profile_id || ""}
                    onChange={(e) => {
                      const c = {
                        ...selectedNode.config,
                        profile_id: e.target.value,
                      };
                      change({
                        ...graph,
                        nodes: graph.nodes.map((n: Data) =>
                          n.id === selected ? { ...n, config: c } : n,
                        ),
                      });
                      setConfig(JSON.stringify(c, null, 2));
                    }}
                  >
                    <option value="">Choose a profile</option>
                    {w.data.profile.map((r) => (
                      <option key={r.value.id} value={r.value.id}>
                        {r.value.name} · {r.value.model}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Configuration JSON
                <textarea
                  rows={15}
                  value={config}
                  onChange={(e) => setConfig(e.target.value)}
                />
              </label>
              <button
                onClick={() => {
                  try {
                    change({
                      ...graph,
                      nodes: graph.nodes.map((n: Data) =>
                        n.id === selected
                          ? { ...n, config: JSON.parse(config) }
                          : n,
                      ),
                    });
                  } catch (e) {
                    w.error(e);
                  }
                }}
              >
                Apply configuration
              </button>
              <div className="nx-actions">
                <button
                  onClick={() =>
                    change({
                      ...graph,
                      nodes: [
                        ...graph.nodes,
                        {
                          ...structuredClone(selectedNode),
                          id: uid(),
                          title: selectedNode.title + " copy",
                          position: {
                            x: selectedNode.position.x + 40,
                            y: selectedNode.position.y + 80,
                          },
                        },
                      ],
                    })
                  }
                >
                  <Copy size={14} />
                  Duplicate
                </button>
                <button
                  onClick={() => {
                    change({
                      ...graph,
                      nodes: graph.nodes.filter((n: Data) => n.id !== selected),
                      edges: graph.edges.filter(
                        (e: Data) =>
                          e.source !== selected && e.target !== selected,
                      ),
                    });
                    setSelected("");
                  }}
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>
            </>
          ) : (
            <p>Select a node to edit its configuration.</p>
          )}
          <details>
            <summary>Resource references</summary>
            {["binding", "profile", "calendar", "document"].map((kind) => (
              <div key={kind}>
                <h3>{kind}</h3>
                {w.data[kind].map((r) => (
                  <div key={r.value.id}>
                    <strong>{r.value.name || r.value.title}</strong>
                    <input
                      readOnly
                      aria-label={`${r.value.name || r.value.title} reference`}
                      value={r.value.id}
                    />
                  </div>
                ))}
              </div>
            ))}
          </details>
          <details>
            <summary>Connect with keyboard</summary>
            <label>
              From
              <select
                value={connectFrom}
                onChange={(e) => setConnectFrom(e.target.value)}
              >
                <option value="">Select</option>
                {graph.nodes.map((n: Data) => (
                  <option key={n.id} value={n.id}>
                    {n.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Output
              <select value={port} onChange={(e) => setPort(e.target.value)}>
                {["out", "true", "false"].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label>
              To
              <select
                value={connectTo}
                onChange={(e) => setConnectTo(e.target.value)}
              >
                <option value="">Select</option>
                {graph.nodes.map((n: Data) => (
                  <option key={n.id} value={n.id}>
                    {n.title}
                  </option>
                ))}
              </select>
            </label>
            <button onClick={() => connect(connectFrom, connectTo, port)}>
              Connect
            </button>
          </details>
          <details>
            <summary>Run limits</summary>
            {Object.keys(graph.limits).map((k) => (
              <label key={k}>
                {k.replaceAll("_", " ")}
                <input
                  type="number"
                  value={graph.limits[k]}
                  onChange={(e) =>
                    change({
                      ...graph,
                      limits: { ...graph.limits, [k]: Number(e.target.value) },
                    })
                  }
                />
              </label>
            ))}
          </details>
        </aside>
      </div>
      <section className="nx-run-console">
        <header>
          <h2>Run console</h2>
          <small>{running ? "Running…" : "Manual runs only"}</small>
        </header>
        {!runs.length && (
          <p className="nx-muted">
            Validate, review the graph and its bindings, then start a run.
          </p>
        )}
        {runs.map((r) => {
          const run = r.value;
          return (
            <details key={run.id} open={r === runs[0]}>
              <summary>
                {run.status} · {run.started_at} · {run.id.slice(0, 8)}
              </summary>
              {Object.keys(run.nested_steps || {}).length > 0 && (
                <details>
                  <summary>Loop steps · retained across retries</summary>
                  {Object.entries(run.nested_steps as Record<string, Data>).map(
                    ([path, step]) => (
                      <div key={path}>
                        <strong>{path}</strong> · {step.node.state} · attempt{" "}
                        {step.node.attempts}
                        {step.node.error && (
                          <p className="nx-error">{step.node.error}</p>
                        )}
                      </div>
                    ),
                  )}
                </details>
              )}
              <div className="nx-run-actions">
                {run.status === "running" && (
                  <button
                    onClick={() =>
                      void call("next_run_cancel", { id: run.id }).catch(
                        w.error,
                      )
                    }
                  >
                    Cancel run
                  </button>
                )}
                {[
                  "awaiting_approval",
                  "interrupted",
                  "failed",
                  "cancelled",
                ].includes(run.status) && (
                  <button
                    onClick={() =>
                      void call("next_run_resume", {
                        id: run.id,
                        approval_digest: run.review.approval_digest,
                        approved_nodes: run.events
                          .filter((e: Data) => e.state === "awaiting_approval")
                          .map((e: Data) => e.node_id),
                        retry_nodes: retry,
                      })
                        .then(w.refresh)
                        .catch(w.error)
                    }
                  >
                    Approve waiting step / resume selected retries
                  </button>
                )}
              </div>
              {Object.entries(run.nodes as Record<string, Data>).map(
                ([id, state]) => (
                  <div className="nx-run-node" key={id}>
                    <strong>
                      {run.review.plan.network.nodes.find(
                        (n: Data) => n.id === id,
                      )?.title || id}
                    </strong>
                    <span>{state.state}</span>
                    {["failed", "interrupted"].includes(state.state) && (
                      <label className="nx-check">
                        <input
                          type="checkbox"
                          checked={retry.includes(id)}
                          onChange={(e) =>
                            setRetry(
                              e.target.checked
                                ? [...retry, id]
                                : retry.filter((x) => x !== id),
                            )
                          }
                        />
                        Retry (may repeat side effects)
                      </label>
                    )}
                    {state.error && <p className="nx-error">{state.error}</p>}
                    {state.output !== null && (
                      <details>
                        <summary>Output</summary>
                        <pre>{JSON.stringify(state.output, null, 2)}</pre>
                        {state.output.document_id && (
                          <button
                            onClick={() =>
                              w.open(
                                "document",
                                state.output.document_id,
                                "Workflow document",
                              )
                            }
                          >
                            Open document
                          </button>
                        )}
                        {state.output.proposal_id && (
                          <button
                            onClick={() =>
                              void call("next_get", {
                                kind: "changeset",
                                id: state.output.proposal_id,
                              })
                                .then((p) => {
                                  setReview({ proposal: p.value });
                                  setTrusted(false);
                                })
                                .catch(w.error)
                            }
                          >
                            Review calendar proposal
                          </button>
                        )}
                      </details>
                    )}
                  </div>
                ),
              )}
            </details>
          );
        })}
      </section>
      {review && (
        <div className="nx-overlay">
          <div
            className="nx-dialog nx-wide"
            role="dialog"
            aria-modal="true"
            aria-label="Review workflow run"
          >
            <header>
              <h2>
                {review.proposal
                  ? "Review calendar changes"
                  : "Review this run"}
              </h2>
              <button onClick={() => setReview(null)}>Close</button>
            </header>
            {review.proposal ? (
              <>
                <pre>{JSON.stringify(review.proposal.changes, null, 2)}</pre>
                <button
                  className="nx-primary"
                  onClick={() =>
                    void call("next_accept_changes", { id: review.proposal.id })
                      .then(() => {
                        setReview(null);
                        return w.refresh();
                      })
                      .catch(w.error)
                  }
                >
                  Accept changes
                </button>
              </>
            ) : (
              <>
                <p>{review.warning}</p>
                <small>
                  Graph revision {review.plan.revision} ·{" "}
                  {review.approval_digest.slice(0, 12)}
                </small>
                <pre>
                  {JSON.stringify(
                    {
                      nodes: review.plan.network.nodes,
                      resources: review.resources,
                      limits: review.plan.network.limits,
                    },
                    null,
                    2,
                  )}
                </pre>
                <label>
                  Run input · JSON
                  <textarea
                    rows={3}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                  />
                </label>
                <label className="nx-check">
                  <input
                    type="checkbox"
                    checked={trusted}
                    onChange={(e) => setTrusted(e.target.checked)}
                  />
                  I reviewed the scripts, model destinations, bindings and
                  declared writes.
                </label>
                <footer>
                  <button
                    disabled={!trusted}
                    onClick={() => {
                      try {
                        download("approved-run.json", {
                          network_id: id,
                          revision: review.plan.revision,
                          approval_digest: review.approval_digest,
                          input: JSON.parse(input),
                        });
                      } catch (e) {
                        w.error(e);
                      }
                    }}
                  >
                    Export CLI run configuration
                  </button>
                  <button
                    className="nx-primary"
                    disabled={!trusted}
                    onClick={() => void run()}
                  >
                    Run approved graph
                  </button>
                </footer>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
