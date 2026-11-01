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
import {
  Play,
  Undo,
  Redo,
  Copy,
  Trash2,
  Folder,
  MousePointer2,
  MoreHorizontal,
} from "lucide-react";
import { useWorkspace, row, call, Data, uid, download } from "./state";
import { catalog, groups, nodeSummary } from "./NodeCatalog";
import { NodeProperties } from "./NodeProperties";
import { NetworkFiles } from "./NetworkFiles";
import { ProjectFiles } from "./ProjectFiles";
import { AutomationSetup, AutomationStatus } from "./Automation";
import { NetworkChecks } from "./NetworkChecks";
function GraphNode({ data, selected }: NodeProps) {
  const d = data as Data;
  const Icon = catalog[d.kind].icon;
  return (
    <div
      className={`nx-graph-node ${d.kind === "process" ? "nx-process-node" : "nx-icon-node"} ${selected ? "selected" : ""}`}
    >
      {d.kind !== "input" && (
        <Handle
          type="target"
          position={Position.Left}
          id="in"
          title="Input · drag an output pin here"
          aria-label={`${d.title} input`}
        />
      )}
      <span className="nx-node-symbol">
        <Icon size={d.kind === "process" ? 22 : 30} />
      </span>
      <strong>{d.title}</strong>
      <small>{d.summary}</small>
      {d.group && <small>{d.group}</small>}
      {d.kind === "process" && d.config.operation === "select_fields" && (
        <label className="nodrag nowheel">
          Fields
          <input
            aria-label={`${d.title} fields`}
            value={(d.config.fields || []).join(", ")}
            onChange={(e) =>
              d.update({
                fields: e.target.value.split(",").map((s) => s.trim()),
              })
            }
          />
        </label>
      )}
      {d.kind === "process" && d.config.operation === "format_text" && (
        <label className="nodrag nowheel">
          Template
          <input
            aria-label={`${d.title} template`}
            value={d.config.template || ""}
            onChange={(e) => d.update({ template: e.target.value })}
          />
        </label>
      )}
      {d.kind === "condition" ? (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="true"
            title="Yes · condition matched"
            aria-label={`${d.title} yes output`}
            style={{ top: "35%" }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="false"
            title="No · condition did not match"
            aria-label={`${d.title} no output`}
            style={{ top: "75%" }}
          />
          <span className="nx-branch-label yes">Yes</span>
          <span className="nx-branch-label no">No</span>
        </>
      ) : (
        d.kind !== "output" && (
          <Handle
            type="source"
            position={Position.Right}
            id="out"
            title="Output · drag to another node's input"
            aria-label={`${d.title} output`}
          />
        )
      )}
    </div>
  );
}
const nodeTypes = { workspace: GraphNode };
const defaults: Record<string, Data> = {
  addon: { addon_id: "", executable_binding: "", timeout_seconds: 300 },
  goal_context: {
    calendar_id: "",
    past_days: 14,
    future_days: 14,
    include_preferences: true,
    include_documents: false,
  },
  network_read: { network_id: "" },
  network_change: { network_id: "" },
  planner: {
    profile_id: "",
    system_prompt:
      "Design a bounded Consilium network. Return JSON {network:{schema_version:1,id,name,nodes,edges,limits}}. Nodes have id,kind,title,config,position:{x,y}; edges have id,source,target,source_port:'out',target_port:'in'. Use only supplied resource IDs. Preserve unrelated steps. No ordinary cycles; use bounded loop nodes. Never execute the graph or invent permissions.",
  },
  input: {},
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
    [libraryKind, setLibraryKind] = useState("agent"),
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
  const [measured, setMeasured] = useState<
    Record<string, { width?: number; height?: number }>
  >({});
  const [canvasQuery, setCanvasQuery] = useState(""),
    [multi, setMulti] = useState<string[]>([]),
    [groupName, setGroupName] = useState("");
  const flow = useRef<ReactFlowInstance<Node, Edge> | null>(null),
    dragStart = useRef<Data | null>(null);
  const canvas = useRef<HTMLDivElement>(null),
    savedGraph = useRef(JSON.stringify(record?.value));
  const initiallyPopulated = useRef(Boolean(record?.value.nodes.length));
  // Recovery drafts are independent of explicitly saved portable project files.
  useEffect(() => {
    try {
      const draft = JSON.parse(
        localStorage.getItem(`network-draft:${id}`) || "null",
      );
      if (draft?.revision === record?.revision && draft.graph?.id === id)
        setGraph(draft.graph);
    } catch {
      /* Ignore a damaged recovery draft. */
    }
  }, [id]);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          `network-draft:${id}`,
          JSON.stringify({ revision, graph }),
        );
      } catch {
        /* Portable saves remain available when recovery storage is full. */
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [graph, revision, id]);
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
  useEffect(() => {
    if (
      record &&
      record.revision !== revision &&
      JSON.stringify(graph) === savedGraph.current
    ) {
      setGraph(structuredClone(record.value));
      savedGraph.current = JSON.stringify(record.value);
      setRevision(record.revision);
      setUndo([]);
      setRedo([]);
    }
  }, [record?.revision]);
  if (!record) return <p>Network not found.</p>;
  function change(next: Data) {
    setUndo([...undo.slice(-39), structuredClone(graph)]);
    setRedo([]);
    setGraph(next);
    setValidation("");
  }
  function select(id: string, additive = false) {
    setSelected(id);
    setMulti((previous) => (additive ? [...new Set([...previous, id])] : [id]));
    setConfig(
      JSON.stringify(
        graph.nodes.find((n: Data) => n.id === id)?.config || {},
        null,
        2,
      ),
    );
  }
  async function save() {
    if (
      record?.revision === revision &&
      JSON.stringify(graph) === savedGraph.current
    )
      return record;
    const r = await w.save("network", graph, revision);
    setRevision(r.revision);
    savedGraph.current = JSON.stringify(graph);
    return r;
  }
  function updateConfig(nodeId: string, patch: Data) {
    const target = graph.nodes.find((n: Data) => n.id === nodeId);
    const config = Object.fromEntries(
      Object.entries({ ...target.config, ...patch }).filter(
        ([, value]) => value !== undefined,
      ),
    );
    change({
      ...graph,
      nodes: graph.nodes.map((n: Data) =>
        n.id === nodeId ? { ...n, config } : n,
      ),
    });
    if (nodeId === selected) setConfig(JSON.stringify(config, null, 2));
  }
  function node(kind: string, position?: { x: number; y: number }) {
    if (!catalog[kind]) return;
    const bounds = canvas.current?.getBoundingClientRect();
    const n = {
      id: uid(),
      kind,
      title: catalog[kind].title,
      config: structuredClone(defaults[kind] || {}),
      position: position ||
        flow.current?.screenToFlowPosition({
          x: bounds ? bounds.left + bounds.width / 2 : window.innerWidth / 2,
          y: bounds ? bounds.top + bounds.height / 2 : window.innerHeight / 2,
        }) || {
          x: 100 + (graph.nodes.length % 3) * 260,
          y: 80 + Math.floor(graph.nodes.length / 3) * 140,
        },
    };
    change({ ...graph, nodes: [...graph.nodes, n] });
    setSelected(n.id);
    setMulti([n.id]);
    setConfig(JSON.stringify(n.config, null, 2));
  }
  const nodes: Node[] = graph.nodes.map((n: Data) => ({
    id: n.id,
    type: "workspace",
    position: n.position,
    measured: measured[n.id],
    data: {
      kind: n.kind,
      title: n.title,
      group: n.config.group || "",
      config: n.config,
      summary: nodeSummary(n),
      update: (patch: Data) => updateConfig(n.id, patch),
    },
    selected: multi.includes(n.id),
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
    const reachable = new Set([target]);
    let size = 0;
    while (size !== reachable.size) {
      size = reachable.size;
      for (const edge of graph.edges)
        if (reachable.has(edge.source)) reachable.add(edge.target);
    }
    if (reachable.has(source)) {
      setValidation(
        "This connection would create a cycle. Use a Repeat node for repetition.",
      );
      return;
    }
    if (
      graph.edges.some(
        (e: Data) =>
          e.source === source &&
          e.target === target &&
          e.source_port === sourceHandle,
      )
    )
      return;
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
        <details className="nx-network-menu">
          <summary aria-label="Network actions" title="Save, export and more">
            <MoreHorizontal size={19} />
          </summary>
          <div>
            <ProjectFiles kind="network" id={id} beforeSave={save} />
            <button
              onClick={() =>
                void call("next_network_validate", { network: graph, revision })
                  .then(() =>
                    setValidation(
                      "Structure is valid. Resource readiness and behavior are separate checks below.",
                    ),
                  )
                  .catch((e) => setValidation(String(e)))
              }
            >
              Validate
            </button>
          </div>
        </details>
        <button
          className="nx-primary"
          disabled={running}
          onClick={() => void prepare()}
        >
          <Play size={16} />
          Review & run
        </button>
      </header>
      <AutomationStatus id={id} />
      <NetworkChecks network={graph} revision={revision} onChange={change} />
      {record.revision !== revision && (
        <div className="nx-validation">
          A newer revision is saved.{" "}
          <button
            onClick={() => {
              download("network-draft.json", graph);
              setGraph(structuredClone(record.value));
              savedGraph.current = JSON.stringify(record.value);
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
          <h2>Node library</h2>
          <small>
            Drag a node onto the canvas. Click to learn what it does.
          </small>
          <input
            aria-label="Find node type"
            placeholder="Find a node"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {groups.map((group) => {
            const entries = Object.entries(catalog).filter(
              ([kind, item]) =>
                item.group === group &&
                `${kind} ${item.title} ${item.description}`
                  .toLowerCase()
                  .includes(filter.toLowerCase()),
            );
            return (
              entries.length > 0 && (
                <details open key={group} className="nx-library-folder">
                  <summary>
                    <Folder size={15} />
                    {group}
                  </summary>
                  {entries.map(([kind, item]) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={kind}
                        draggable
                        aria-pressed={libraryKind === kind}
                        aria-label={item.title}
                        title={item.description}
                        onClick={() => setLibraryKind(kind)}
                        onDragStart={(e) => {
                          setLibraryKind(kind);
                          e.dataTransfer.setData(
                            "application/consilium-node",
                            kind,
                          );
                          e.dataTransfer.effectAllowed = "copy";
                        }}
                      >
                        <Icon size={20} />
                        <span>{item.title}</span>
                      </button>
                    );
                  })}
                </details>
              )
            );
          })}
          <div className="nx-library-help">
            <strong>{catalog[libraryKind].title}</strong>
            <p>{catalog[libraryKind].description}</p>
            <button onClick={() => node(libraryKind)}>
              <MousePointer2 size={15} />
              Place in canvas centre
            </button>
          </div>
          <button
            onClick={() =>
              void save()
                .then(() =>
                  w.open("assistant", `network:${id}`, "Network assistant"),
                )
                .catch(w.error)
            }
          >
            Design with AI
          </button>
        </aside>
        <div
          className="nx-canvas"
          ref={canvas}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(e) => {
            e.preventDefault();
            const kind = e.dataTransfer.getData("application/consilium-node");
            if (catalog[kind] && flow.current)
              node(
                kind,
                flow.current.screenToFlowPosition({
                  x: e.clientX,
                  y: e.clientY,
                }),
              );
          }}
        >
          <div className="nx-canvas-hint">
            Drag nodes to move them · connect a right pin to a left pin
          </div>
          <ReactFlow
            onInit={(instance) => {
              flow.current = instance;
            }}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={(event, n) => select(n.id, event.shiftKey)}
            onPaneClick={() => {
              setSelected("");
              setMulti([]);
            }}
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
              if (changes.some((c) => c.type === "select"))
                setMulti(next.filter((n) => n.selected).map((n) => n.id));
              if (changes.some((c) => c.type === "dimensions"))
                setMeasured((previous) => ({
                  ...previous,
                  ...Object.fromEntries(
                    next
                      .filter((n) => n.measured)
                      .map((n) => [n.id, n.measured!]),
                  ),
                }));
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
            fitView={initiallyPopulated.current}
            fitViewOptions={{ maxZoom: 1, padding: 0.25 }}
            connectionRadius={32}
            defaultEdgeOptions={{ style: { strokeWidth: 2 } }}
            colorMode="dark"
            deleteKeyCode="Delete"
          >
            <Background color="#393939" gap={24} />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>
        <aside className="nx-inspector">
          <NetworkFiles graph={graph} />
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
              <NodeProperties
                node={selectedNode}
                update={(patch) => updateConfig(selected, patch)}
              />
              <details className="nx-advanced">
                <summary>Advanced node settings</summary>
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
                      const parsed = JSON.parse(config);
                      if (
                        !parsed ||
                        typeof parsed !== "object" ||
                        Array.isArray(parsed)
                      )
                        throw Error("Configuration must be a JSON object.");
                      change({
                        ...graph,
                        nodes: graph.nodes.map((n: Data) =>
                          n.id === selected ? { ...n, config: parsed } : n,
                        ),
                      });
                    } catch (e) {
                      w.error(e);
                    }
                  }}
                >
                  Apply configuration
                </button>
              </details>
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
          <details className="nx-advanced">
            <summary>Advanced network settings</summary>
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
                        limits: {
                          ...graph.limits,
                          [k]: Number(e.target.value),
                        },
                      })
                    }
                  />
                </label>
              ))}
            </details>
          </details>
        </aside>
      </div>
      <section className="nx-run-console">
        <header>
          <h2>Run console</h2>
          <small>{running ? "Running…" : "Local run history"}</small>
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
                            Review change proposal
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
                  ? "Review proposed changes"
                  : "Review this run"}
              </h2>
              <button onClick={() => setReview(null)}>Close</button>
            </header>
            {review.proposal ? (
              <>
                <pre>{JSON.stringify(review.proposal.changes, null, 2)}</pre>
                {review.proposal.changes
                  .filter((c: Data) => c.kind === "network")
                  .map((c: Data) => (
                    <NetworkChecks
                      key={c.id}
                      network={c.value}
                      revision={c.expected_revision + 1}
                    />
                  ))}
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
                <h3>Steps in this run</h3>
                {review.plan.network.nodes.map((n: Data) => (
                  <div key={n.id} className="nx-review-step">
                    <strong>{n.title}</strong>
                    <p>{catalog[n.kind]?.description}</p>
                    {(n.kind === "agent" || n.kind === "planner") && (
                      <p>
                        Model:{" "}
                        {
                          review.resources[`profile:${n.config.profile_id}`]
                            ?.value.provider
                        }{" "}
                        ·{" "}
                        {
                          review.resources[`profile:${n.config.profile_id}`]
                            ?.value.model
                        }
                      </p>
                    )}
                    {n.kind === "addon" && (
                      <details>
                        <summary>Review add-on source</summary>
                        <pre>
                          {
                            review.resources[`addon:${n.config.addon_id}`]
                              ?.value.manifest.source
                          }
                        </pre>
                      </details>
                    )}
                    {n.kind === "process" &&
                      (!n.config.operation ||
                        n.config.operation === "script") && (
                        <details open>
                          <summary>Review program</summary>
                          <pre>
                            {n.config.script_binding
                              ? review.resources[
                                  `script:${n.config.script_binding}`
                                ]
                              : n.config.source}
                          </pre>
                        </details>
                      )}
                  </div>
                ))}
                <h3>Linked resources</h3>
                {Object.entries(review.resources as Record<string, Data>)
                  .filter(([key]) => !key.startsWith("script:"))
                  .map(([key, r]) => (
                    <p key={key}>
                      <strong>{r.value.name || r.value.title}</strong>
                      {r.value.path ? ` · ${r.value.path}` : ""}
                      {r.value.writable ? " · May write" : ""}
                    </p>
                  ))}
                <p>
                  Run limit:{" "}
                  {Math.round(review.plan.network.limits.timeout_seconds / 60)}{" "}
                  minutes · {review.plan.network.limits.model_calls} model
                  requests
                </p>
                <details className="nx-advanced">
                  <summary>Advanced run details & input</summary>
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
                </details>
                <label className="nx-check">
                  <input
                    type="checkbox"
                    checked={trusted}
                    onChange={(e) => setTrusted(e.target.checked)}
                  />
                  I reviewed the scripts, model destinations, bindings and
                  declared writes.
                </label>
                <AutomationSetup
                  id={id}
                  review={review}
                  input={input}
                  trusted={trusted}
                />
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
