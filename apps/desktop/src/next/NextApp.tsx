import { useEffect, useState, useRef, lazy, Suspense } from "react";
import {
  Home as HomeIcon,
  CalendarDays,
  Network,
  Search,
  Settings,
  MessageSquare,
  Plus,
  PanelLeft,
  ArrowLeft,
  ArrowRight,
  X,
  Minus,
  Maximize2,
  FileText,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { native } from "../api";
import { readAppearance } from "../Customization";
import {
  WorkspaceContext,
  call,
  empty,
  row,
  uid,
  zone,
  Data,
  Snapshot,
  TabDescriptor,
  taskDefault,
  flushDocuments,
} from "./state";
import { HomeView, SearchView, SettingsView } from "./WorkspaceViews";
import { CalendarView, TaskView, TaskForm } from "./CalendarViews";
import { AssistantView, DocumentView } from "./ContentViews";
const NetworkView = lazy(() =>
  import("./NetworkView").then((m) => ({ default: m.NetworkView })),
);
import "./next.css";
const home: TabDescriptor = {
  id: "home",
  kind: "home",
  objectId: "",
  title: "Home",
};
export default function NextApp() {
  const [data, setData] = useState<Snapshot>(empty),
    [loaded, setLoaded] = useState(false),
    [tabs, setTabs] = useState<TabDescriptor[]>(() => {
      try {
        return JSON.parse(localStorage.getItem("next-tabs") || "[]").length
          ? JSON.parse(localStorage.getItem("next-tabs")!)
          : [home];
      } catch {
        return [home];
      }
    }),
    [active, setActive] = useState("home"),
    [visited, setVisited] = useState<string[]>(["home"]),
    [side, setSide] = useState(true),
    [query, setQuery] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [creator, setCreator] = useState(false),
    [createKind, setCreateKind] = useState(""),
    [name, setName] = useState(""),
    [destination, setDestination] = useState(""),
    [task, setTask] = useState<Data | null>(null),
    [appearance, setAppearance] = useState(readAppearance),
    [history, setHistory] = useState(["home"]),
    [historyIndex, setHistoryIndex] = useState(0);
  const search = useRef<HTMLInputElement>(null);
  const navigation = useRef(0);
  useEffect(
    () =>
      setVisited((previous) =>
        previous.includes(active) ? previous : [...previous, active],
      ),
    [active],
  );
  const error = (e: unknown) => setMessage(String(e).replace(/^Error: /, ""));
  async function refresh() {
    setData(await call("next_snapshot"));
  }
  useEffect(() => {
    void refresh()
      .catch(error)
      .finally(() => setLoaded(true));
    const handler = () => setAppearance(readAppearance());
    window.addEventListener("consilium-appearance", handler);
    return () => window.removeEventListener("consilium-appearance", handler);
  }, []);
  useEffect(
    () => localStorage.setItem("next-tabs", JSON.stringify(tabs)),
    [tabs],
  );
  async function activate(id: string, historyTarget?: number) {
    const request = ++navigation.current;
    const current = tabs.find((tab) => tab.id === active);
    // Snapshot while the iframe is visible: hidden WebViews may stop painting
    // and therefore stop processing Wordcraft's queued commands.
    if (id !== active && current?.kind === "document") {
      if (!(await flushDocuments(current.objectId))) {
        error("Save or recover the document draft before switching tabs.");
        return;
      }
    }
    if (request !== navigation.current) return;
    setActive(id);
    if (historyTarget !== undefined) setHistoryIndex(historyTarget);
    else {
      setHistory((h) => [...h.slice(0, historyIndex + 1), id]);
      setHistoryIndex(historyIndex + 1);
    }
  }
  function open(kind: string, id = "", title?: string) {
    const key = kind === "home" ? "home" : `${kind}:${id}`;
    setTabs((t) =>
      t.some((x) => x.id === key)
        ? t
        : [
            ...t,
            {
              id: key,
              kind,
              objectId: id,
              title:
                title ||
                row(data, kind, id)?.value.name ||
                row(data, kind, id)?.value.title ||
                kind[0].toUpperCase() + kind.slice(1),
            },
          ],
    );
    activate(key);
  }
  async function close(id: string) {
    if (id === "home") return;
    const tab = tabs.find((t) => t.id === id);
    if (tab?.kind === "document" && !(await flushDocuments(tab.objectId))) {
      error("Save or recover the document draft before closing its tab.");
      return;
    }
    setTabs((t) => t.filter((x) => x.id !== id));
    if (active === id) setActive("home");
  }
  useEffect(() => {
    if (!native) return;
    const listener = getCurrentWindow().onCloseRequested(async (event) => {
      event.preventDefault();
      if (await flushDocuments()) await getCurrentWindow().destroy();
      else
        error(
          "A document has an unsaved or conflicting draft. Save or export it before closing.",
        );
    });
    return () => {
      void listener.then((unlisten) => unlisten());
    };
  }, []);
  async function save(kind: string, value: Data, revision?: number) {
    const r = await call("next_save", {
      kind,
      value,
      revision: revision ?? row(data, kind, value.id)?.revision ?? 0,
    });
    await refresh();
    return r;
  }
  function create(calendar?: string, date?: string, parent?: string) {
    if (calendar) {
      setTask({
        ...taskDefault(
          calendar,
          date,
          row(data, "calendar", calendar)?.value.timezone,
        ),
        parent_id: parent || null,
      });
    } else {
      setCreator(true);
      setCreateKind("");
      setName("");
      setDestination(data.calendar[0]?.value.id || "");
    }
  }
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key === "Tab") {
        const dialog = document.querySelector<HTMLElement>(
          '.nx-overlay [role="dialog"],.nx-overlay .nx-dialog',
        );
        if (dialog) {
          const elements = [
            ...dialog.querySelectorAll<HTMLElement>(
              'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
            ),
          ].filter((el) => el.offsetParent !== null);
          const first = elements[0],
            last = elements.at(-1);
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }
      if (e.ctrlKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        search.current?.focus();
      }
      if (e.ctrlKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        create();
      }
      if (e.ctrlKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        open("assistant");
      }
      if (e.key === "Escape") {
        setCreator(false);
        setTask(null);
        setMessage("");
        setQuery("");
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [data, active]);
  async function finishCreate() {
    try {
      if (createKind === "task") {
        create(destination);
        setCreator(false);
        return;
      }
      const id = uid();
      const value =
        createKind === "calendar"
          ? { id, name, timezone: zone() }
          : {
              schema_version: 1,
              id,
              name,
              nodes: [],
              edges: [],
              limits: {
                concurrency: 2,
                iterations: 5,
                model_calls: 20,
                timeout_seconds: 1800,
              },
            };
      await save(createKind, value, 0);
      setCreator(false);
      open(createKind, id, name);
    } catch (e) {
      error(e);
    }
  }
  const icon = (kind: string) => {
    const C =
      (
        {
          home: HomeIcon,
          calendar: CalendarDays,
          network: Network,
          assistant: MessageSquare,
          thread: MessageSquare,
          document: FileText,
          settings: Settings,
          search: Search,
        } as Record<string, typeof HomeIcon>
      )[kind] || CalendarDays;
    return <C size={15} />;
  };
  if (!loaded)
    return (
      <div className="nx-loading">
        <img src="/app-icon.png" alt="Consilium Next" />
        <span>Opening workspace…</span>
      </div>
    );
  return (
    <WorkspaceContext.Provider
      value={{ data, refresh, save, open, create, error, busy, setBusy }}
    >
      <div
        className={`next-app palette-${appearance.palette}`}
        style={
          {
            "--nx-row": `${appearance.rowHeight}px`,
            "--accent": (
              {
                green: "#a3c9ae",
                blue: "#99bce8",
                purple: "#bca5df",
                amber: "#ddc188",
              } as Record<string, string>
            )[appearance.accent],
            "--nx-gap": `${appearance.rowGap}px`,
            "--nx-col-gap": `${appearance.columnGap}px`,
            "--nx-hour": `${appearance.hourHeight}px`,
            fontSize: appearance.fontSize,
          } as React.CSSProperties
        }
      >
        <header className="nx-title">
          <button
            aria-label="Back"
            disabled={historyIndex === 0}
            onClick={() => {
              void activate(
                tabs.some((t) => t.id === history[historyIndex - 1])
                  ? history[historyIndex - 1]
                  : "home",
                historyIndex - 1,
              );
            }}
          >
            <ArrowLeft size={15} />
          </button>
          <button
            aria-label="Forward"
            disabled={historyIndex >= history.length - 1}
            onClick={() => {
              void activate(history[historyIndex + 1], historyIndex + 1);
            }}
          >
            <ArrowRight size={15} />
          </button>
          <button aria-label="Toggle sidebar" onClick={() => setSide(!side)}>
            <PanelLeft size={16} />
          </button>
          <details className="nx-menu">
            <summary>File</summary>
            <div>
              <button onClick={() => create()}>
                Create… <kbd>Ctrl N</kbd>
              </button>
              <button
                onClick={() =>
                  void call("next_project_dialog", { operation: "open" })
                    .then(async (r) => {
                      if (!r.cancelled) {
                        await refresh();
                        open(r.kind, r.id);
                      }
                    })
                    .catch(error)
                }
              >
                Open project…
              </button>
              <button onClick={() => void call("new_window").catch(error)}>
                New window
              </button>
              <button
                onClick={() =>
                  void call("backup")
                    .then(() => setMessage("Backup created"))
                    .catch(error)
                }
              >
                Back up workspace
              </button>
            </div>
          </details>
          <button onClick={() => open("settings")}>Settings</button>
          <div className="nx-search">
            <Search size={14} />
            <input
              ref={search}
              aria-label="Search workspace"
              placeholder="Search workspace"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <div className="nx-search-results">
                <SearchView query={query} onChoose={() => setQuery("")} />
              </div>
            )}
          </div>
          <span className="nx-drag" data-tauri-drag-region>
            Consilium Next
          </span>
          <div className="nx-window">
            {native && (
              <>
                <button
                  aria-label="Minimize"
                  onClick={() => void getCurrentWindow().minimize()}
                >
                  <Minus size={15} />
                </button>
                <button
                  aria-label="Maximize"
                  onClick={() => void getCurrentWindow().toggleMaximize()}
                >
                  <Maximize2 size={13} />
                </button>
                <button
                  aria-label="Close window"
                  onClick={() => void getCurrentWindow().close()}
                >
                  <X size={17} />
                </button>
              </>
            )}
          </div>
        </header>
        <div className="nx-body">
          {side && (
            <aside className="nx-sidebar">
              <button className="nx-brand" onClick={() => open("home")}>
                <img src="/app-icon.png" alt="" />
                Consilium
              </button>
              <button className="nx-create" onClick={() => create()}>
                <Plus size={17} />
                Create
              </button>
              {[
                ["home", "Home"],
                ["assistant", "Assistant"],
                ["search", "Search"],
              ].map(([kind, label]) => (
                <button key={kind} onClick={() => open(kind)}>
                  {icon(kind)}
                  {label}
                </button>
              ))}
              <small>Calendars</small>
              {data.calendar.map((r) => (
                <button
                  key={r.value.id}
                  onClick={() => open("calendar", r.value.id, r.value.name)}
                >
                  <CalendarDays size={15} />
                  <span>{r.value.name}</span>
                </button>
              ))}
              <small>Networks</small>
              {data.network.map((r) => (
                <button
                  key={r.value.id}
                  onClick={() => open("network", r.value.id, r.value.name)}
                >
                  <Network size={15} />
                  <span>{r.value.name}</span>
                </button>
              ))}
              <small>Recent conversations</small>
              {data.thread
                .slice(-6)
                .reverse()
                .map((r) => (
                  <button
                    key={r.value.id}
                    onClick={() => open("thread", r.value.id, r.value.title)}
                  >
                    <MessageSquare size={14} />
                    <span>{r.value.title}</span>
                  </button>
                ))}
              <div className="nx-side-bottom">
                <button onClick={() => open("settings")}>
                  <Settings size={16} />
                  Settings
                </button>
                <small>Next · local preview</small>
              </div>
            </aside>
          )}
          <main className="nx-main">
            <nav className="nx-tabs" aria-label="Workspace tabs">
              {tabs.map((t) => (
                <div className={active === t.id ? "selected" : ""} key={t.id}>
                  <button
                    role="tab"
                    aria-selected={active === t.id}
                    onClick={() => activate(t.id)}
                  >
                    {icon(t.kind)}
                    {t.title}
                  </button>
                  {t.kind !== "home" && (
                    <button
                      aria-label={`Close ${t.title}`}
                      onClick={() => close(t.id)}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))}
              <button aria-label="Create item" onClick={() => create()}>
                <Plus size={15} />
              </button>
            </nav>
            {tabs
              .filter((t) => visited.includes(t.id))
              .map((t) => (
                <section
                  key={t.id}
                  className="nx-tabpage"
                  hidden={active !== t.id}
                >
                  {t.kind === "home" ? (
                    <HomeView />
                  ) : t.kind === "calendar" ? (
                    <CalendarView id={t.objectId} />
                  ) : t.kind === "task" ? (
                    <TaskView id={t.objectId} />
                  ) : t.kind === "document" ? (
                    <DocumentView id={t.objectId} active={active === t.id} />
                  ) : t.kind === "network" ? (
                    <Suspense fallback={<p>Opening network…</p>}>
                      <NetworkView id={t.objectId} />
                    </Suspense>
                  ) : t.kind === "assistant" || t.kind === "thread" ? (
                    <AssistantView id={t.objectId} />
                  ) : t.kind === "settings" ? (
                    <SettingsView />
                  ) : (
                    <SearchView />
                  )}
                </section>
              ))}
          </main>
        </div>
        {message && (
          <div className="nx-toast" role="status">
            {message}
            <button aria-label="Dismiss message" onClick={() => setMessage("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {creator && (
          <div
            className="nx-overlay"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setCreator(false);
            }}
          >
            <div
              className="nx-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="Create"
            >
              <header>
                <h2>Create</h2>
                <button aria-label="Close" onClick={() => setCreator(false)}>
                  <X size={18} />
                </button>
              </header>
              {!createKind ? (
                <div className="nx-choice">
                  <button onClick={() => setCreateKind("calendar")}>
                    <CalendarDays />
                    Calendar
                  </button>
                  <button onClick={() => setCreateKind("network")}>
                    <Network />
                    Network
                  </button>
                  <button onClick={() => setCreateKind("task")}>
                    <Plus />
                    Task in an existing calendar
                  </button>
                </div>
              ) : (
                <>
                  <button onClick={() => setCreateKind("")}>← Back</button>
                  {createKind === "task" ? (
                    <label>
                      Destination calendar
                      <select
                        value={destination}
                        onChange={(e) => setDestination(e.target.value)}
                      >
                        {data.calendar.map((c) => (
                          <option key={c.value.id} value={c.value.id}>
                            {c.value.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label>
                      Name
                      <input
                        autoFocus
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void finishCreate();
                        }}
                      />
                    </label>
                  )}
                  <footer>
                    <button
                      className="nx-primary"
                      disabled={
                        createKind === "task" ? !destination : !name.trim()
                      }
                      onClick={() => void finishCreate()}
                    >
                      Continue
                    </button>
                  </footer>
                </>
              )}
            </div>
          </div>
        )}
        {task && (
          <TaskForm initial={task} revision={0} onClose={() => setTask(null)} />
        )}
      </div>
    </WorkspaceContext.Provider>
  );
}
