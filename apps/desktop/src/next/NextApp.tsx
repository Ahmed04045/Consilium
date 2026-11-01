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
  colorInk,
} from "./state";
import { HomeView, SearchView } from "./WorkspaceViews";
import { CalendarView, TaskView, TaskForm } from "./CalendarViews";
import { AssistantView, DocumentView } from "./ContentViews";
const NetworkView = lazy(() =>
  import("./NetworkView").then((m) => ({ default: m.NetworkView })),
);
import "./next.css";
import { SettingsScreen } from "./SettingsScreen";
import { AppMenu } from "./AppMenus";
import { themeFor } from "./theme";
import { Sidebar } from "./Sidebar";
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
        const saved: TabDescriptor[] = JSON.parse(
          localStorage.getItem("next-tabs") || "[]",
        );
        let assistant = false;
        const normalized = saved
          .filter((t) => t.kind !== "settings")
          .filter((t) => {
            if (!["assistant", "thread"].includes(t.kind)) return true;
            if (assistant) return false;
            assistant = true;
            return true;
          })
          .map((t) =>
            ["assistant", "thread"].includes(t.kind)
              ? { ...t, kind: "assistant", title: "Assistant" }
              : t,
          );
        return normalized.some((t) => t.id === "home")
          ? normalized
          : [home, ...normalized];
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
  const [settingsPage, setSettingsPage] = useState<string | null>(null);
  const [settingsMounted, setSettingsMounted] = useState(false);
  const [zoom, setZoom] = useState(1);
  const editTarget = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const focus = (event: FocusEvent) => {
      const el = event.target as HTMLElement;
      if (el.matches('input,textarea,[contenteditable="true"]'))
        editTarget.current = el;
    };
    document.addEventListener("focusin", focus);
    return () => document.removeEventListener("focusin", focus);
  }, []);
  async function showSettings(page = "appearance") {
    const current = tabs.find((tab) => tab.id === active);
    if (
      current?.kind === "document" &&
      !(await flushDocuments(current.objectId))
    ) {
      error("Save or recover your document before opening Settings.");
      return;
    }
    setSettingsMounted(true);
    setSettingsPage(page);
  }
  async function edit(command: string) {
    const el = editTarget.current;
    if (!el || !el.isConnected || el.closest("[hidden]")) {
      error(
        "Select a text field first. Documents use their own editing toolbar.",
      );
      return;
    }
    el.focus();
    try {
      if (command === "paste")
        document.execCommand(
          "insertText",
          false,
          await navigator.clipboard.readText(),
        );
      else document.execCommand(command);
    } catch {
      error(
        "Clipboard access is unavailable. Use the keyboard shortcut in the editor.",
      );
    }
  }
  function cycleTab(direction: number) {
    setSettingsPage(null);
    const index = tabs.findIndex((t) => t.id === active);
    void activate(tabs[(index + direction + tabs.length) % tabs.length].id);
  }
  async function fullscreen() {
    try {
      if (native) {
        const win = getCurrentWindow();
        await win.setFullscreen(!(await win.isFullscreen()));
      } else if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (e) {
      error(e);
    }
  }
  useEffect(() => {
    const dismiss = (event: Event) => {
      document
        .querySelectorAll<HTMLDetailsElement>(
          ".nx-menu[open],.nx-network-menu[open]",
        )
        .forEach((menu) => {
          if (event.type === "keydown" || !menu.contains(event.target as Node))
            menu.open = false;
        });
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss(event);
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", key);
    };
  }, []);
  useEffect(() => {
    const removed = (event: Event) => {
      const keys = (event as CustomEvent<string[]>).detail;
      setTabs((old) =>
        old
          .filter((t) => !keys.includes(t.kind + ":" + t.objectId))
          .map((t) =>
            t.kind === "assistant" && keys.includes("thread:" + t.objectId)
              ? { ...t, objectId: "draft" }
              : t,
          ),
      );
      if (
        keys.includes(
          tabs.find((t) => t.id === active)?.kind +
            ":" +
            tabs.find((t) => t.id === active)?.objectId,
        )
      )
        setActive("home");
    };
    window.addEventListener("consilium-items-deleted", removed);
    return () => window.removeEventListener("consilium-items-deleted", removed);
  }, [active, tabs]);
  const search = useRef<HTMLInputElement>(null);
  const tabBar = useRef<HTMLElement>(null);
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
    const snapshot = await call<Snapshot>("next_snapshot");
    const reset = snapshot.layout?.find((r) => r.value.id === "workspace-reset")
      ?.value.token;
    if (reset && localStorage.getItem("next-reset-seen") !== reset) {
      for (const key of Object.keys(localStorage))
        if (
          key === "next-tabs" ||
          key === "next-navigation-groups" ||
          key.startsWith("network-draft:")
        )
          localStorage.removeItem(key);
      localStorage.setItem("next-reset-seen", reset);
      setTabs([home]);
      setActive("home");
      setVisited(["home"]);
      setHistory(["home"]);
      setHistoryIndex(0);
    }
    setData(snapshot);
  }
  useEffect(() => {
    if (!native || !data.automation?.some((r) => r.value.enabled)) return;
    const timer = setInterval(() => void refresh().catch(error), 5000);
    return () => clearInterval(timer);
  }, [data.automation?.some((r) => r.value.enabled)]);
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
  useEffect(() => {
    tabBar.current
      ?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active, tabs.length]);
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
    setSettingsPage(null);
    setActive(id);
    if (historyTarget !== undefined) setHistoryIndex(historyTarget);
    else {
      setHistory((h) => [...h.slice(0, historyIndex + 1), id]);
      setHistoryIndex(historyIndex + 1);
    }
  }
  function open(kind: string, id = "", title?: string) {
    if (kind === "settings") {
      void showSettings();
      return;
    }
    setSettingsPage(null);
    if (kind === "assistant" || kind === "thread") {
      const existing = tabs.find(
        (t) => t.kind === "assistant" || t.kind === "thread",
      );
      const key = existing?.id || "assistant";
      const nextId =
        kind === "thread" ? id : id.startsWith("draft:") ? "draft" : id;
      setTabs((old) =>
        existing
          ? old.map((t) =>
              t.id === key
                ? {
                    ...t,
                    kind: "assistant",
                    objectId: nextId,
                    title: "Assistant",
                  }
                : t,
            )
          : [
              ...old,
              {
                id: key,
                kind: "assistant",
                objectId: nextId,
                title: "Assistant",
              },
            ],
      );
      void activate(key);
      return;
    }
    const existing = tabs.find((t) => t.kind === kind && t.objectId === id);
    const base = kind === "home" ? "home" : `${kind}:${id}`;
    const key =
      existing?.id ||
      (tabs.some((t) => t.id === base) ? `${base}:${uid()}` : base);
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
  function bindThread(tabId: string, threadId: string, title: string) {
    // Keep the React/tab identity: an in-flight request belongs to this view.
    setTabs((previous) =>
      previous.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              kind: "assistant",
              objectId: threadId,
              title: "Assistant",
            }
          : tab,
      ),
    );
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
      if (e.ctrlKey && e.key === ",") {
        e.preventDefault();
        void showSettings();
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        setSide((s) => !s);
        return;
      }
      if (e.ctrlKey && ["PageUp", "PageDown"].includes(e.key)) {
        e.preventDefault();
        cycleTab(e.key === "PageUp" ? -1 : 1);
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === "w") {
        e.preventDefault();
        if (settingsPage) setSettingsPage(null);
        else void close(active);
        return;
      }
      if (e.ctrlKey && ["+", "=", "-", "0"].includes(e.key)) {
        e.preventDefault();
        setZoom((z) =>
          e.key === "0"
            ? 1
            : Math.max(0.8, Math.min(1.5, z + (e.key === "-" ? -0.1 : 0.1))),
        );
        return;
      }
      if (e.key === "F11") {
        e.preventDefault();
        void fullscreen();
        return;
      }
      if (e.altKey && ["ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        if (settingsPage) {
          if (e.key === "ArrowLeft") setSettingsPage(null);
          return;
        }
        const index = historyIndex + (e.key === "ArrowLeft" ? -1 : 1);
        if (index >= 0 && index < history.length)
          void activate(
            tabs.some((t) => t.id === history[index]) ? history[index] : "home",
            index,
          );
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        search.current?.focus();
        return;
      }
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
  }, [data, active, tabs, history, historyIndex, settingsPage]);
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
      value={{
        data,
        refresh,
        save,
        open,
        bindThread,
        create,
        error,
        busy,
        setBusy,
      }}
    >
      <div
        className={`next-app palette-${appearance.palette} nx-density-${appearance.density}`}
        style={
          {
            ...(appearance.backgroundColor
              ? themeFor(appearance.backgroundColor)
              : {}),
            "--nx-row": `${appearance.rowHeight}px`,
            "--accent":
              appearance.accentColor ||
              (
                {
                  green: "#a3c9ae",
                  blue: "#99bce8",
                  purple: "#bca5df",
                  amber: "#ddc188",
                } as Record<string, string>
              )[appearance.accent],
            "--accent-ink": colorInk(
              appearance.accentColor ||
                (
                  {
                    green: "#a3c9ae",
                    blue: "#99bce8",
                    purple: "#bca5df",
                    amber: "#ddc188",
                  } as Record<string, string>
                )[appearance.accent],
            ),
            "--nx-gap": `${appearance.rowGap}px`,
            "--nx-col-gap": `${appearance.columnGap}px`,
            "--nx-hour": `${appearance.hourHeight}px`,
            "--type-body": `${appearance.fontSize}px`,
            "--type-small": `${Math.max(10, appearance.fontSize - 2)}px`,
            "--type-control": `${Math.max(11, appearance.fontSize - 1)}px`,
            "--type-heading": `${appearance.fontSize + 2}px`,
            "--type-title": `${appearance.fontSize + 8}px`,
            fontSize: appearance.fontSize,
          } as React.CSSProperties
        }
      >
        <header className="nx-title">
          <button
            aria-label="Back"
            className="nx-navigation-button"
            title={settingsPage ? "Back to app" : "Back (Alt+Left)"}
            disabled={!settingsPage && historyIndex === 0}
            onClick={() => {
              if (settingsPage) {
                setSettingsPage(null);
                return;
              }
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
            className="nx-navigation-button"
            title="Forward (Alt+Right)"
            disabled={!!settingsPage || historyIndex >= history.length - 1}
            onClick={() => {
              void activate(history[historyIndex + 1], historyIndex + 1);
            }}
          >
            <ArrowRight size={15} />
          </button>
          <button
            aria-label="Toggle sidebar"
            disabled={!!settingsPage}
            onClick={() => setSide(!side)}
          >
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
          <AppMenu
            label="Edit"
            items={[
              ...[
                ["Undo", "undo", "Ctrl+Z"],
                ["Redo", "redo", "Ctrl+Y"],
                ["Cut", "cut", "Ctrl+X"],
                ["Copy", "copy", "Ctrl+C"],
                ["Paste", "paste", "Ctrl+V"],
                ["Delete", "delete", "Delete"],
                ["Select all", "selectAll", "Ctrl+A"],
              ].map(([label, command, shortcut]) => ({
                label,
                shortcut,
                action: () => void edit(command),
                divider: command === "cut" || command === "selectAll",
              })),
              {
                label: "Settings…",
                shortcut: "Ctrl+,",
                divider: true,
                action: () => void showSettings(),
              },
            ]}
          />
          <AppMenu
            label="View"
            items={[
              {
                label: side ? "Hide sidebar" : "Show sidebar",
                shortcut: "Ctrl+Shift+S",
                action: () => setSide(!side),
                disabled: !!settingsPage,
              },
              {
                label: "Find",
                shortcut: "Ctrl+F",
                action: () => search.current?.focus(),
              },
              {
                label: "Back",
                shortcut: "Alt+Left",
                disabled: !settingsPage && historyIndex === 0,
                action: () =>
                  settingsPage
                    ? setSettingsPage(null)
                    : void activate(
                        tabs.some((t) => t.id === history[historyIndex - 1])
                          ? history[historyIndex - 1]
                          : "home",
                        historyIndex - 1,
                      ),
              },
              {
                label: "Forward",
                shortcut: "Alt+Right",
                disabled: !!settingsPage || historyIndex >= history.length - 1,
                action: () =>
                  void activate(history[historyIndex + 1], historyIndex + 1),
              },
              {
                label: "Previous tab",
                shortcut: "Ctrl+PageUp",
                divider: true,
                action: () => cycleTab(-1),
              },
              {
                label: "Next tab",
                shortcut: "Ctrl+PageDown",
                action: () => cycleTab(1),
              },
              {
                label: "Zoom in",
                shortcut: "Ctrl++",
                divider: true,
                disabled: zoom >= 1.5,
                action: () => setZoom((z) => Math.min(1.5, z + 0.1)),
              },
              {
                label: "Zoom out",
                shortcut: "Ctrl+-",
                disabled: zoom <= 0.8,
                action: () => setZoom((z) => Math.max(0.8, z - 0.1)),
              },
              {
                label: "Actual size",
                shortcut: "Ctrl+0",
                action: () => setZoom(1),
              },
              {
                label: "Toggle full screen",
                shortcut: "F11",
                divider: true,
                action: () => void fullscreen(),
              },
            ]}
          />
          <AppMenu
            label="Help"
            items={[
              {
                label: "Documentation",
                action: () => void showSettings("help"),
              },
              {
                label: "Keyboard shortcuts",
                action: () => void showSettings("shortcuts"),
              },
              {
                label: "What’s new",
                action: () => void showSettings("whats-new"),
              },
              {
                label: "Troubleshooting",
                divider: true,
                action: () => void showSettings("troubleshooting"),
              },
              {
                label: "About Consilium",
                divider: true,
                action: () => void showSettings("about"),
              },
            ]}
          />
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
        <div className="nx-body" hidden={!!settingsPage} style={{ zoom }}>
          {side && <Sidebar active={tabs.find((t) => t.id === active)} />}
          <main className="nx-main">
            <nav ref={tabBar} className="nx-tabs" aria-label="Workspace tabs">
              {tabs.map((t) => (
                <div className={active === t.id ? "selected" : ""} key={t.id}>
                  <button
                    role="tab"
                    aria-selected={active === t.id}
                    title={t.title}
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
                    <DocumentView
                      id={t.objectId}
                      active={active === t.id && !settingsPage}
                    />
                  ) : t.kind === "network" ? (
                    <Suspense fallback={<p>Opening network…</p>}>
                      <NetworkView id={t.objectId} />
                    </Suspense>
                  ) : t.kind === "assistant" || t.kind === "thread" ? (
                    <AssistantView id={t.objectId} tabId={t.id} />
                  ) : (
                    <SearchView />
                  )}
                </section>
              ))}
          </main>
        </div>
        {settingsMounted && (
          <div
            className="nx-settings-host"
            hidden={!settingsPage}
            style={{ zoom }}
          >
            <SettingsScreen
              page={settingsPage || "appearance"}
              onPage={setSettingsPage}
              onBack={() => setSettingsPage(null)}
            />
          </div>
        )}
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
                <div className="nx-dialog-heading">
                  {createKind && (
                    <button
                      className="nx-navigation-button"
                      aria-label="Back to create options"
                      title="Back to create options"
                      onClick={() => setCreateKind("")}
                    >
                      <ArrowLeft size={18} />
                    </button>
                  )}
                  <h2>Create</h2>
                </div>
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
