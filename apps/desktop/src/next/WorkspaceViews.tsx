import { useEffect, useRef, useState } from "react";
import {
  Plus,
  Search,
  ArrowUp,
  ArrowDown,
  Pin,
  CalendarDays,
  Network,
  FileText,
  MessageSquare,
  ArrowUpRight,
  FolderOpen,
  GripVertical,
} from "lucide-react";
import { native } from "../api";
import { Customization } from "../Customization";
import { openProject } from "./ProjectFiles";
import { Addons } from "./Addons";
import {
  call,
  useWorkspace,
  Data,
  uid,
  row,
  download,
  localDate,
} from "./state";
const defaults = () => ({
  id: "home",
  presentation: "grid",
  density: "comfortable",
  editing: false,
  widgets: [
    {
      id: "calendars",
      kind: "calendar",
      title: "Calendars",
      visible: true,
      width: 2,
      height: 1,
      object_id: "",
    },
    {
      id: "networks",
      kind: "network",
      title: "Networks",
      visible: true,
      width: 2,
      height: 1,
      object_id: "",
    },
    {
      id: "documents",
      kind: "document",
      title: "Documents",
      visible: true,
      width: 2,
      height: 1,
      object_id: "",
    },
    {
      id: "conversations",
      kind: "thread",
      title: "Conversations",
      visible: true,
      width: 2,
      height: 1,
      object_id: "",
    },
  ],
  pinned: [] as string[],
});
export function HomeView() {
  const w = useWorkspace(),
    saved = row(w.data, "layout", "home"),
    [layout, setLayout] = useState<Data>(saved?.value || defaults()),
    [editing, setEditing] = useState(false),
    [drag, setDrag] = useState(""),
    [query, setQuery] = useState("");
  useEffect(() => {
    if (saved) setLayout(saved.value);
  }, [saved?.revision]);
  function update(value: Data) {
    setLayout(value);
    void w.save("layout", value, saved?.revision || 0).catch(w.error);
  }
  function move(id: string, delta: number) {
    const list = [...layout.widgets];
    const i = list.findIndex((x) => x.id === id),
      j = Math.max(0, Math.min(list.length - 1, i + delta));
    const [item] = list.splice(i, 1);
    list.splice(j, 0, item);
    update({ ...layout, widgets: list });
  }
  const icons: Record<string, typeof CalendarDays> = {
    calendar: CalendarDays,
    network: Network,
    document: FileText,
    thread: MessageSquare,
    task: CalendarDays,
    run: Network,
  };
  const recent = ["calendar", "network", "document", "thread"]
    .flatMap((kind) =>
      (w.data[kind] || [])
        .filter((r) => !r.value.deleted)
        .map((r) => ({ ...r, kind })),
    )
    .sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
  const hasItems = recent.length > 0;
  return (
    <div
      className={`nx-home nx-${layout.density} ${query ? "nx-home-searching" : ""}`}
    >
      <header className="nx-toolbar">
        <div>
          <p className="nx-home-eyebrow">Workspace</p>
          <h1>Home</h1>
        </div>
        <span className="nx-spacer" />
        <button onClick={() => setEditing(!editing)}>
          {editing ? "Done" : "Customize"}
        </button>
        <button onClick={() => void openProject(w).catch(w.error)}>
          <FolderOpen size={16} />
          Open project
        </button>
        <button className="nx-home-create" onClick={() => w.create()}>
          <Plus size={16} />
          Create
        </button>
      </header>
      <div className="nx-home-search">
        <Search size={18} />
        <input
          aria-label="Search from Home"
          placeholder="Find a calendar, network, document or conversation"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {query && <SearchView query={query} onChoose={() => setQuery("")} />}
      {!query && !editing && !hasItems && (
        <section className="nx-home-start">
          <div className="nx-start-icons">
            <CalendarDays size={24} />
            <Network size={24} />
            <FileText size={24} />
          </div>
          <h2>Create your first workspace</h2>
          <p>Start with a calendar or a network, or open a saved project.</p>
          <button onClick={() => w.create()}>
            <Plus size={16} />
            Create workspace
          </button>
        </section>
      )}
      {!query && !editing && hasItems && (
        <section className="nx-recent-section" aria-label="Recent work">
          <header>
            <h2>Recent work</h2>
            <small>Last updated</small>
          </header>
          <div className="nx-recent-grid">
            {recent.slice(0, 4).map((r) => {
              const Icon = icons[r.kind];
              return (
                <button
                  className="nx-recent-card"
                  key={`${r.kind}:${r.value.id}`}
                  onClick={() =>
                    w.open(r.kind, r.value.id, r.value.name || r.value.title)
                  }
                >
                  <div>
                    <Icon size={19} />
                    <ArrowUpRight size={14} />
                  </div>
                  <strong>{r.value.name || r.value.title}</strong>
                  <small>
                    {
                      {
                        calendar: "Calendar",
                        network: "Network",
                        document: "Document",
                        thread: "Conversation",
                      }[r.kind]
                    }
                  </small>
                </button>
              );
            })}
          </div>
        </section>
      )}
      {editing && (
        <div className="nx-layout-controls">
          <p>
            Drag a card to reposition it. Adjust its width and height below.
          </p>
          <label>
            Presentation
            <select
              value={layout.presentation}
              onChange={(e) =>
                update({ ...layout, presentation: e.target.value })
              }
            >
              <option value="grid">Grid</option>
              <option value="list">List</option>
            </select>
          </label>
          <label>
            Density
            <select
              value={layout.density}
              onChange={(e) => update({ ...layout, density: e.target.value })}
            >
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
          </label>
          <label>
            Add widget
            <select
              value=""
              onChange={(e) =>
                update({
                  ...layout,
                  widgets: [
                    ...layout.widgets,
                    {
                      id: uid(),
                      kind: e.target.value,
                      title: e.target.selectedOptions[0].text,
                      visible: true,
                      width: 2,
                      height: 1,
                      object_id: "",
                    },
                  ],
                })
              }
            >
              <option value="">Choose a widget</option>
              <option value="calendar">Calendar preview</option>
              <option value="task">Task list</option>
              <option value="run">Run status</option>
              <option value="document">Document preview</option>
              <option value="thread">Conversation shortcuts</option>
            </select>
          </label>
          <button onClick={() => update(defaults())}>Reset layout</button>
          {layout.widgets
            .filter((x: Data) => !x.visible)
            .map((x: Data) => (
              <button
                key={x.id}
                onClick={() =>
                  update({
                    ...layout,
                    widgets: layout.widgets.map((v: Data) =>
                      v.id === x.id ? { ...v, visible: true } : v,
                    ),
                  })
                }
              >
                Show {x.title}
              </button>
            ))}
        </div>
      )}
      {(editing || layout.pinned.length > 0) && (
        <section className="nx-pins">
          <h2>Pinned</h2>
          {layout.pinned.length ? (
            layout.pinned.map((key: string) => {
              const [kind, id] = key.split(":");
              const r = row(w.data, kind, id);
              return (
                r && (
                  <button
                    key={key}
                    onClick={() =>
                      w.open(kind, id, r.value.name || r.value.title)
                    }
                  >
                    <Pin size={14} />
                    {r.value.name || r.value.title}
                  </button>
                )
              );
            })
          ) : (
            <small>Pin items from the sections below.</small>
          )}
        </section>
      )}
      {(editing || hasItems) && (
        <>
          <h2 className="nx-workspace-heading">Your workspace</h2>
          <div
            className={`nx-widgets ${layout.presentation === "list" ? "list" : ""}`}
          >
            {layout.widgets
              .filter((x: Data) => x.visible)
              .map((widget: Data) => {
                const Icon = icons[widget.kind] || FileText;
                const records =
                  w.data[widget.kind]
                    ?.filter(
                      (r) =>
                        !r.value.deleted &&
                        (!widget.object_id || r.value.id === widget.object_id),
                    )
                    .slice()
                    .sort((a, b) =>
                      (b.updated_at || "").localeCompare(a.updated_at || ""),
                    )
                    .slice(0, 8) || [];
                return (
                  <section
                    key={widget.id}
                    className="nx-widget"
                    draggable={editing}
                    onDragStart={() => setDrag(widget.id)}
                    onDragOver={(e) => {
                      if (editing) e.preventDefault();
                    }}
                    onDrop={() => {
                      const from = layout.widgets.findIndex(
                          (x: Data) => x.id === drag,
                        ),
                        to = layout.widgets.findIndex(
                          (x: Data) => x.id === widget.id,
                        );
                      move(drag, to - from);
                    }}
                    style={{
                      gridColumn: `span ${layout.presentation === "list" ? 4 : widget.width}`,
                      minHeight: widget.height * 150,
                    }}
                  >
                    <header>
                      {editing && (
                        <span
                          className="nx-drag-handle"
                          title="Drag to reposition"
                        >
                          <GripVertical size={16} />
                        </span>
                      )}
                      <h2>
                        <Icon size={18} />
                        {widget.title}
                      </h2>
                      {editing && (
                        <>
                          <button
                            aria-label={`Move ${widget.title} earlier`}
                            onClick={() => move(widget.id, -1)}
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            aria-label={`Move ${widget.title} later`}
                            onClick={() => move(widget.id, 1)}
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            onClick={() =>
                              update({
                                ...layout,
                                widgets: layout.widgets.map((x: Data) =>
                                  x.id === widget.id
                                    ? { ...x, visible: false }
                                    : x,
                                ),
                              })
                            }
                          >
                            Hide
                          </button>
                        </>
                      )}
                    </header>
                    {editing && (
                      <div className="nx-widget-controls">
                        <label>
                          Width
                          <input
                            type="range"
                            min="1"
                            max="4"
                            value={widget.width}
                            onChange={(e) =>
                              update({
                                ...layout,
                                widgets: layout.widgets.map((x: Data) =>
                                  x.id === widget.id
                                    ? { ...x, width: Number(e.target.value) }
                                    : x,
                                ),
                              })
                            }
                          />
                        </label>
                        <label>
                          Height
                          <input
                            type="range"
                            min="1"
                            max="4"
                            value={widget.height}
                            onChange={(e) =>
                              update({
                                ...layout,
                                widgets: layout.widgets.map((x: Data) =>
                                  x.id === widget.id
                                    ? { ...x, height: Number(e.target.value) }
                                    : x,
                                ),
                              })
                            }
                          />
                        </label>
                        <label>
                          Reference
                          <select
                            value={widget.object_id}
                            onChange={(e) =>
                              update({
                                ...layout,
                                widgets: layout.widgets.map((x: Data) =>
                                  x.id === widget.id
                                    ? { ...x, object_id: e.target.value }
                                    : x,
                                ),
                              })
                            }
                          >
                            <option value="">Recent items</option>
                            {w.data[widget.kind]?.map((r) => (
                              <option value={r.value.id} key={r.value.id}>
                                {r.value.name || r.value.title || r.value.id}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    )}
                    {records.length ? (
                      records.map((r) => (
                        <div className="nx-home-item" key={r.value.id}>
                          <button
                            onClick={() =>
                              w.open(
                                widget.kind === "run" ? "network" : widget.kind,
                                widget.kind === "run"
                                  ? r.value.network_id
                                  : r.value.id,
                                r.value.name || r.value.title,
                              )
                            }
                          >
                            <span>
                              {r.value.name || r.value.title || r.value.status}
                            </span>
                            <small>
                              {widget.kind === "document"
                                ? r.value.text?.slice(0, 100)
                                : widget.kind === "task"
                                  ? r.value.start_date
                                  : widget.kind === "run"
                                    ? r.value.started_at
                                    : ""}
                            </small>
                          </button>
                          <button
                            aria-label={`Pin ${r.value.name || r.value.title}`}
                            aria-pressed={layout.pinned.includes(
                              `${widget.kind}:${r.value.id}`,
                            )}
                            onClick={() => {
                              const key = `${widget.kind}:${r.value.id}`;
                              update({
                                ...layout,
                                pinned: layout.pinned.includes(key)
                                  ? layout.pinned.filter(
                                      (x: string) => x !== key,
                                    )
                                  : [...layout.pinned, key],
                              });
                            }}
                          >
                            <Pin size={13} />
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="nx-muted">
                        No {widget.title.toLowerCase()} yet.
                      </p>
                    )}
                    {widget.kind === "calendar" && widget.object_id && (
                      <div className="nx-mini-calendar">
                        {Array.from(
                          {
                            length: new Date(
                              new Date().getFullYear(),
                              new Date().getMonth(),
                              1,
                            ).getDay(),
                          },
                          (_, i) => (
                            <span key={`blank-${i}`} />
                          ),
                        )}
                        {Array.from(
                          {
                            length: new Date(
                              new Date().getFullYear(),
                              new Date().getMonth() + 1,
                              0,
                            ).getDate(),
                          },
                          (_, i) => (
                            <span
                              key={i}
                              className={
                                Number(localDate().slice(-2)) === i + 1
                                  ? "today"
                                  : ""
                              }
                            >
                              {i + 1}
                            </span>
                          ),
                        )}
                      </div>
                    )}
                  </section>
                );
              })}
          </div>
        </>
      )}
    </div>
  );
}
export function SearchView({
  query: external,
  onChoose,
}: {
  query?: string;
  onChoose?: () => void;
}) {
  const w = useWorkspace(),
    [query, setQuery] = useState("");
  const q = external ?? query;
  const results = ["calendar", "task", "network", "document", "thread"]
    .flatMap((kind) =>
      w.data[kind]
        .filter(
          (r) =>
            !r.value.deleted &&
            `${r.value.name || ""} ${r.value.title || ""} ${r.value.description || ""} ${r.value.text || ""}`
              .toLowerCase()
              .includes(q.toLowerCase()),
        )
        .map((r) => ({ kind, r })),
    )
    .slice(0, 40);
  return (
    <div
      className={
        external === undefined ? "nx-page nx-search-page" : "nx-inline-search"
      }
    >
      {external === undefined && (
        <>
          <h1>Search</h1>
          <input
            autoFocus
            aria-label="Search all workspace content"
            placeholder="Search your workspace"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </>
      )}
      {q &&
        results.map(({ kind, r }) => (
          <button
            className="nx-list-row"
            key={`${kind}:${r.value.id}`}
            onClick={() => {
              w.open(kind, r.value.id, r.value.name || r.value.title);
              onChoose?.();
            }}
          >
            <span>{r.value.name || r.value.title}</span>
            <small>{kind}</small>
          </button>
        ))}
      {q && !results.length && <p>No matching items.</p>}
    </div>
  );
}
export function SettingsView({ page = "models" }: { page?: string }) {
  const w = useWorkspace(),
    [profile, setProfile] = useState<Data>({
      id: uid(),
      name: "",
      provider: "gemini",
      model: "",
      endpoint: "",
      context_tokens: 32768,
      credential_id: null,
    }),
    [keys, setKeys] = useState<Data>({ keys: [] }),
    [keyName, setKeyName] = useState(""),
    [secret, setSecret] = useState(""),
    [status, setStatus] = useState(""),
    [testing, setTesting] = useState(false),
    [binding, setBinding] = useState<Data>({
      id: uid(),
      name: "",
      kind: "file",
      path: "",
      writable: false,
    }),
    [context, setContext] = useState(
      row(w.data, "layout", "context")?.value.text || "",
    );
  const contextRevision = useRef(
    row(w.data, "layout", "context")?.revision || 0,
  );
  const [contextStatus, setContextStatus] = useState("");
  const [savingContext, setSavingContext] = useState(false);
  const [storageStatus, setStorageStatus] = useState("");
  function loadKeys() {
    if (!native) {
      setKeys({ keys: [] });
      return;
    }
    if (["gemini", "openrouter"].includes(profile.provider))
      void call("named_keys", { provider: profile.provider, action: "list" })
        .then(setKeys)
        .catch(w.error);
    else setKeys({ keys: [] });
  }
  useEffect(loadKeys, [profile.provider]);
  return (
    <div
      className="nx-page nx-settings"
      hidden={
        ![
          "models",
          "context",
          "files",
          "appearance",
          "addons",
          "storage",
          "personal",
          "data",
        ].includes(page)
      }
    >
      <section hidden={page !== "models"}>
        <h2>Model profiles</h2>
        <p className="nx-muted">
          Each conversation and agent chooses a profile independently.
        </p>
        <div className="nx-profile-list">
          {w.data.profile.map((r) => (
            <button
              key={r.value.id}
              onClick={() => {
                setProfile(r.value);
                setStatus("");
              }}
            >
              {r.value.name}
              <small>
                {r.value.provider} · {r.value.model}
              </small>
            </button>
          ))}
          <button
            onClick={() =>
              setProfile({
                id: uid(),
                name: "",
                provider: "gemini",
                model: "",
                endpoint: "",
                context_tokens: 32768,
                credential_id: null,
              })
            }
          >
            <Plus size={15} />
            New profile
          </button>
        </div>
        <div className="nx-fields">
          <label>
            Profile name
            <input
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
            />
          </label>
          <label>
            Provider
            <select
              value={profile.provider}
              onChange={(e) => {
                setProfile({
                  ...profile,
                  provider: e.target.value,
                  credential_id: null,
                  endpoint:
                    e.target.value === "ollama"
                      ? "http://127.0.0.1:11434"
                      : e.target.value === "openai"
                        ? "http://127.0.0.1:1234/v1"
                        : "",
                });
              }}
            >
              <option value="gemini">Gemini</option>
              <option value="openrouter">OpenRouter</option>
              <option value="ollama">Ollama</option>
              <option value="openai">Local OpenAI-compatible</option>
            </select>
          </label>
          <label>
            Exact model ID
            <input
              value={profile.model}
              onChange={(e) =>
                setProfile({ ...profile, model: e.target.value })
              }
            />
          </label>
          <label>
            Context window
            <input
              type="number"
              min="2048"
              max="131072"
              value={profile.context_tokens}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  context_tokens: Number(e.target.value),
                })
              }
            />
          </label>
        </div>
        {["gemini", "openrouter"].includes(profile.provider) ? (
          <>
            <label>
              Saved API key
              <select
                value={profile.credential_id || ""}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    credential_id: e.target.value || null,
                  })
                }
              >
                <option value="">Choose a named key</option>
                {keys.keys.map((k: Data) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
            </label>
            <details>
              <summary>Save a new key</summary>
              <div className="nx-fields">
                <label>
                  Key name
                  <input
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                  />
                </label>
                <label>
                  API key
                  <input
                    type="password"
                    autoComplete="off"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                  />
                </label>
              </div>
              <button
                disabled={!keyName.trim() || !secret.trim()}
                onClick={() =>
                  void call("named_keys", {
                    provider: profile.provider,
                    action: "save",
                    name: keyName,
                    key: secret,
                  })
                    .then((k) => {
                      setKeys(k);
                      setProfile({ ...profile, credential_id: k.selected });
                      setSecret("");
                      setKeyName("");
                    })
                    .catch(w.error)
                }
              >
                Save API key
              </button>
            </details>
          </>
        ) : (
          <label>
            Local endpoint
            <input
              value={profile.endpoint}
              onChange={(e) =>
                setProfile({ ...profile, endpoint: e.target.value })
              }
            />
          </label>
        )}
        <div className="nx-actions">
          <button
            className="nx-primary"
            disabled={!profile.name || !profile.model}
            onClick={() =>
              void w
                .save("profile", profile)
                .then(() => setStatus("Profile saved"))
                .catch(w.error)
            }
          >
            Save profile
          </button>
          <button
            disabled={testing || !row(w.data, "profile", profile.id)}
            onClick={() => {
              setStatus("");
              setTesting(true);
              void call("next_test_profile", { id: profile.id })
                .then((r) => setStatus(r.message))
                .catch((e) => setStatus(String(e)))
                .finally(() => setTesting(false));
            }}
          >
            {testing ? "Testing…" : "Test saved profile"}
          </button>
          <span role="status">{status}</span>
        </div>
      </section>
      <section hidden={!["context", "personal"].includes(page)}>
        <h2>Personal context</h2>
        <p className="nx-muted">
          Tell the assistant about your goals, preferences and constraints.
          These details inform your conversations; connected folders are shared
          only when you choose.
        </p>
        <textarea
          aria-label="Personal context"
          rows={6}
          value={context}
          onChange={(e) => {
            setContext(e.target.value);
            setContextStatus("");
          }}
        />
        <div className="nx-actions">
          <button
            disabled={savingContext}
            onClick={() => {
              const old = row(w.data, "layout", "context");
              setSavingContext(true);
              setContextStatus("");
              void w
                .save(
                  "layout",
                  {
                    id: "context",
                    text: context,
                    history: [
                      ...(old?.value.history || []),
                      {
                        at: new Date().toISOString(),
                        text: old?.value.text || "",
                      },
                    ],
                  },
                  contextRevision.current,
                )
                .then((r) => {
                  contextRevision.current = r.revision;
                  setContextStatus("Context saved");
                })
                .catch(w.error)
                .finally(() => setSavingContext(false));
            }}
          >
            {savingContext ? "Saving…" : "Save context"}
          </button>
          <span role="status">{contextStatus}</span>
        </div>
        <details>
          <summary>Previous context</summary>
          {!row(w.data, "layout", "context")?.value.history?.length && (
            <p className="nx-muted">
              Previous versions will appear here after your first save.
            </p>
          )}
          {row(w.data, "layout", "context")?.value.history?.map(
            (h: Data, i: number) => (
              <article key={i}>
                <small>{h.at}</small>
                <pre>{h.text}</pre>
              </article>
            ),
          )}
        </details>
      </section>
      <section hidden={!["files", "data"].includes(page)}>
        <h2>Connected files & folders</h2>
        <p className="nx-muted">
          Give a file or folder a name to use in workflows. Connecting it does
          not read or share its contents.
        </p>
        {w.data.binding.map((r) => (
          <button
            className="nx-list-row"
            key={r.value.id}
            onClick={() => setBinding(r.value)}
          >
            {r.value.name}
            <small>{r.value.kind}</small>
          </button>
        ))}
        <div className="nx-fields">
          <label>
            Name
            <input
              value={binding.name}
              onChange={(e) => setBinding({ ...binding, name: e.target.value })}
            />
          </label>
          <label>
            Kind
            <select
              value={binding.kind}
              onChange={(e) => setBinding({ ...binding, kind: e.target.value })}
            >
              <option value="file">File</option>
              <option value="folder">Folder</option>
              <option value="executable">Executable runtime</option>
            </select>
          </label>
        </div>
        <label>
          Path
          <input
            value={binding.path}
            onChange={(e) => setBinding({ ...binding, path: e.target.value })}
          />
        </label>
        <label className="nx-check">
          <input
            type="checkbox"
            checked={binding.writable}
            onChange={(e) =>
              setBinding({ ...binding, writable: e.target.checked })
            }
          />
          Allow writes to this location
        </label>
        <div className="nx-actions">
          <button
            onClick={() =>
              void call("next_pick_path", binding)
                .then((r) => {
                  if (r.path) setBinding({ ...binding, path: r.path });
                })
                .catch(w.error)
            }
          >
            Choose…
          </button>
          <button
            disabled={!binding.name || !binding.path}
            onClick={() =>
              void w
                .save("binding", binding)
                .then(() =>
                  setBinding({
                    id: uid(),
                    name: "",
                    kind: "file",
                    path: "",
                    writable: false,
                  }),
                )
                .catch(w.error)
            }
          >
            Save connection
          </button>
        </div>
      </section>
      <div hidden={page !== "appearance"}>
        <Customization />
      </div>
      <div hidden={page !== "addons"}>
        <Addons />
      </div>
      <section hidden={!["storage", "data"].includes(page)}>
        <h2>Backups & recovery</h2>
        <p>
          Create a recovery copy before making major changes. Importing an
          earlier preview copies its data into this workspace.
        </p>
        <div className="nx-actions">
          <button
            disabled={w.data.calendar.length > 0}
            onClick={() =>
              void call("next_import_dialog").then(w.refresh).catch(w.error)
            }
          >
            Copy preview vault…
          </button>
          <button
            onClick={() =>
              void call("backup")
                .then(() => setStorageStatus("Backup created"))
                .catch(w.error)
            }
          >
            Create backup
          </button>
          <button onClick={() => void openProject(w).catch(w.error)}>
            Open Consilium project…
          </button>
          <button onClick={() => download("workspace-records.json", w.data)}>
            Export local records
          </button>
          <button
            onClick={() =>
              void call("next_get", { kind: "migration", id: "archive" })
                .then((r) => download("preview-recovery-archive.json", r.value))
                .catch(w.error)
            }
          >
            Export migration archive
          </button>
        </div>
        {storageStatus && <p role="status">{storageStatus}</p>}
        <label>
          Import a legacy network
          <input
            type="file"
            accept=".json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file)
                void file
                  .text()
                  .then((text) =>
                    call("next_network_import", { package: JSON.parse(text) }),
                  )
                  .then(async (r) => {
                    await w.refresh();
                    w.open("network", r.value.id, r.value.name);
                  })
                  .catch(w.error);
              e.target.value = "";
            }}
          />
        </label>
        <small>
          Imported networks remain stopped until their local bindings and run
          review are complete.
        </small>
        <small>Exports include personal content. Keep them private.</small>
      </section>
    </div>
  );
}
