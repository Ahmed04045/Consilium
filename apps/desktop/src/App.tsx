import { useEffect, useRef, useState, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Download,
  Leaf,
  LoaderCircle,
  Maximize2,
  MessageSquare,
  Minus,
  PanelLeft,
  Plus,
  Search,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { cancel, native, rpc } from "./api";
import {
  colors,
  dateKey,
  newTask,
  parseDate,
  type CalendarSnapshot,
  type Task,
  type Workspace,
} from "./calendar";
import type { RecordValue } from "./types";
import { ContextPanel } from "./ContextPanel";
import { TaskWorkspace } from "./TaskWorkspace";
import { TaskButton } from "./TaskButton";
import { Timeline } from "./Timeline";
import { readAppearance } from "./Customization";
import { SettingsView } from "./SettingsView";
import fontLicense from "./google-sans-LICENSE.txt?raw";

type Location = {
  page: "calendar" | "settings" | "search" | "assistant" | "task";
  taskId?: string;
  calendarId: string;
  date: string;
};
type Suggestion = { id: string; tasks: Task[] };
const today = (timezone?: string) =>
  timezone
    ? new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date())
    : dateKey(new Date());
function IconButton({
  label,
  children,
  onClick,
  disabled = false,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="icon-button tooltip"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
      <span className="tip" role="tooltip">
        {label}
      </span>
    </button>
  );
}
function Mark() {
  return <img className="app-mark" src="/app-icon.png" alt="Consilium" />;
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-label={title}
    >
      <header>
        <h2>{title}</h2>
        <IconButton label="Close dialog" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </header>
      {children}
    </dialog>
  );
}
export default function App() {
  const [data, setData] = useState<CalendarSnapshot>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Location[]>([
    { page: "calendar", calendarId: "default", date: today() },
  ]);
  const [position, setPosition] = useState(0);
  const loc = history[position];
  const [taskTabs, setTaskTabs] = useState<string[]>([]);
  const dirtyTasks = useRef(new Set<string>());
  const openedTasks = useRef(new Map<string, Task>());
  const [sidebar, setSidebar] = useState(true);
  const [menu, setMenu] = useState("");
  const [appearance, setAppearance] = useState(readAppearance);
  const [view, setView] = useState(readAppearance().defaultView);
  useEffect(() => {
    const update = () => setAppearance(readAppearance());
    window.addEventListener("consilium-appearance", update);
    return () => window.removeEventListener("consilium-appearance", update);
  }, []);
  const [labelFilter, setLabelFilter] = useState<string[]>([]);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [labelName, setLabelName] = useState("");
  const [labelColor, setLabelColor] = useState("green");
  const [titleQuery, setTitleQuery] = useState("");
  const [contextOpen, setContextOpen] = useState(false);
  const [repeat, setRepeat] = useState("none");
  const [repeatCount, setRepeatCount] = useState(7);

  const [edit, setEdit] = useState<Task | null>(null);
  useEffect(() => {
    setRepeat("none");
  }, [edit?.id]);
  const [createCalendar, setCreateCalendar] = useState(false);
  const [calendarName, setCalendarName] = useState("");
  const [openedPages, setOpenedPages] = useState<string[]>(["search"]);
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (loc.page === "search") searchInput.current?.focus();
    document
      .querySelector<HTMLElement>('.tabs [aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [loc.page, loc.calendarId]);
  const [query, setQuery] = useState("");
  const [help, setHelp] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [zone, setZone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [undo, setUndo] = useState<Workspace[]>([]);
  const [redo, setRedo] = useState<Workspace[]>([]);
  const [request, setRequest] = useState("");
  const horizonDays = 31;
  const dailyBudget = 1440;
  const [packet, setPacket] = useState<{
    context: { personal_revision: number };
    revision: number;
    provider: string;
    settings_revision: number;
  } | null>(null);

  const cloud = ["gemini", "openrouter"].includes(
    data?.settings.value.provider || "",
  );
  useEffect(() => {
    setPacket(null);
  }, [
    request,
    horizonDays,
    dailyBudget,
    loc.date,
    loc.calendarId,
    data?.workspace.revision,
    data?.settings.revision,
  ]);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [generating, setGenerating] = useState(false);
  const requestId = useRef<string>("");
  const latest = useRef(data);
  latest.current = data;
  const calendar =
    data?.workspace.value.calendars.find((c) => c.id === loc.calendarId) ??
    data?.workspace.value.calendars[0];
  const navigate = (next: Partial<Location>) => {
    if (next.page && next.page !== "calendar")
      setOpenedPages((p) => (p.includes(next.page!) ? p : [...p, next.page!]));
    setHistory((h) => [...h.slice(0, position + 1), { ...loc, ...next }]);
    setPosition(position + 1);
    setMenu("");
  };
  function openTask(task: Task, calendarId = calendar?.id || loc.calendarId) {
    openedTasks.current.set(task.id, task);
    setTaskTabs((t) => (t.includes(task.id) ? t : [...t, task.id]));
    navigate({ page: "task", taskId: task.id, calendarId, date: task.date });
  }
  async function toggleTask(task: Task) {
    const current = latest.current;
    if (!current || busy) return;
    await save({
      ...current.workspace.value,
      calendars: current.workspace.value.calendars.map((c) => ({
        ...c,
        tasks: c.tasks.map((t) =>
          t.id === task.id ? { ...t, completed: !t.completed } : t,
        ),
      })),
    });
  }
  function closeTask(id: string) {
    if (dirtyTasks.current.has(id)) {
      setError(
        "This document has unsaved changes. Wait for Saved locally, or export and reload it before closing the tab.",
      );
      return;
    }
    setTaskTabs((t) => t.filter((v) => v !== id));
    openedTasks.current.delete(id);
    if (loc.taskId === id) navigate({ page: "calendar" });
  }
  async function refresh() {
    const result = await rpc<CalendarSnapshot>("calendar_snapshot");
    setData(result);
    return result;
  }
  useEffect(() => {
    refresh()
      .then((d) => {
        setOnboarding(!d.workspace.value.onboarded);
        setHistory([
          {
            page: "calendar",
            calendarId: d.workspace.value.calendars[0].id,
            date: today(d.workspace.value.timezone),
          },
        ]);
        setPosition(0);
      })
      .catch((e) => setError(String(e)));
  }, []);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 3000);
    return () => clearTimeout(id);
  }, [notice]);
  useEffect(() => {
    const fn = () => {
      if (latest.current && native)
        void refresh().catch((e) => setError(String(e)));
    };
    window.addEventListener("focus", fn);
    return () => window.removeEventListener("focus", fn);
  }, []);
  async function save(value: Workspace, remember = true) {
    if (!data || busy) return false;
    setBusy(true);
    setError("");
    try {
      const workspace = await rpc<RecordValue<Workspace>>("calendar_save", {
        revision: data.workspace.revision,
        value,
      });
      if (remember) {
        setUndo((u) => [...u.slice(-29), data.workspace.value]);
        setRedo([]);
      }
      setData({ ...data, workspace });
      setNotice("Saved");
      setSuggestion(null);
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function saveTask(remove = false) {
    if (!data || !calendar || !edit) return;
    if (remove && dirtyTasks.current.has(edit.id)) {
      setError("Save or export the task document before deleting this task.");
      return;
    }
    const tasks = calendar.tasks.filter((t) => t.id !== edit.id);
    if (!remove) {
      tasks.push(edit);
      if (!calendar.tasks.some((t) => t.id === edit.id) && repeat !== "none") {
        for (let i = 1; i < repeatCount; i++) {
          const d = parseDate(edit.date);
          if (repeat === "monthly") {
            const day = d.getDate();
            d.setDate(1);
            d.setMonth(d.getMonth() + i);
            d.setDate(
              Math.min(
                day,
                new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(),
              ),
            );
          } else d.setDate(d.getDate() + i * (repeat === "weekly" ? 7 : 1));
          if (repeat === "weekdays" && [0, 6].includes(d.getDay())) continue;
          tasks.push({ ...edit, id: crypto.randomUUID(), date: dateKey(d) });
        }
      }
    }
    if (
      await save({
        ...data.workspace.value,
        labels:
          edit.label &&
          !(data.workspace.value.labels ?? []).some(
            (l) => l.name === edit.label,
          )
            ? [
                ...(data.workspace.value.labels ?? []),
                { name: edit.label, color: edit.color },
              ]
            : data.workspace.value.labels,
        calendars: data.workspace.value.calendars.map((c) =>
          c.id === calendar.id ? { ...c, tasks } : c,
        ),
      })
    )
      setEdit(null);
  }
  async function undoChange(forward = false) {
    if (!data) return;
    const stack = forward ? redo : undo;
    const value = stack.at(-1);
    if (!value) return;
    if (await save(value, false)) {
      if (forward) {
        setRedo(stack.slice(0, -1));
        setUndo([...undo, data.workspace.value]);
      } else {
        setUndo(stack.slice(0, -1));
        setRedo([...redo, data.workspace.value]);
      }
    }
  }
  async function finishOnboarding() {
    if (!data) return;
    if (!native) {
      setOnboarding(false);
      return;
    }
    if (
      await save(
        { ...data.workspace.value, onboarded: true, timezone: zone },
        false,
      )
    ) {
      navigate({ date: today(zone) });
      setOnboarding(false);
    }
  }
  async function exportCalendar() {
    setMenu("");
    try {
      const r = await rpc<{ saved: boolean }>("export_calendar_file", {
        id: calendar?.id,
      });
      if (r.saved) setNotice("Calendar exported");
    } catch (e) {
      setError(String(e));
    }
  }
  async function propose() {
    if (!calendar) return;
    setGenerating(true);
    setError("");
    setSuggestion(null);
    requestId.current = crypto.randomUUID();
    try {
      const fresh = await rpc<NonNullable<typeof packet>>("calendar_context", {
        calendar_id: calendar.id,
        date: loc.date,
        days: horizonDays,
        daily_budget: dailyBudget,
      });
      setPacket(fresh);
      setSuggestion(
        await rpc<Suggestion>(
          "calendar_propose",
          {
            calendar_id: calendar.id,
            request,
            date: loc.date,
            days: horizonDays,
            daily_budget: dailyBudget,
            cloud_approved: true,
            personal_revision: fresh.context.personal_revision,
            context_revision: fresh.revision,
            settings_revision: fresh.settings_revision,
            cloud_provider: fresh.provider,
          },
          requestId.current,
        ),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setGenerating(false);
    }
  }
  async function accept() {
    if (!data || !suggestion) return;
    setBusy(true);
    try {
      const workspace = await rpc<RecordValue<Workspace>>("calendar_accept", {
        id: suggestion.id,
      });
      setUndo([...undo, data.workspace.value]);
      setRedo([]);
      setData({ ...data, workspace });
      setSuggestion(null);
      setNotice("Suggestions added");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const shift = (amount: number) => {
    const d = parseDate(loc.date);
    if (view === "Month") d.setMonth(d.getMonth() + amount, 1);
    else d.setDate(d.getDate() + amount * (view === "Week" ? 7 : 1));
    navigate({ date: dateKey(d) });
  };
  const addTask = () => {
    setRepeat("none");
    setEdit(newTask(loc.date));
    setMenu("");
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu("");
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        ["k", "p", "n", "t", "s", ","].includes(e.key.toLowerCase())
      ) {
        e.preventDefault();
        const k = e.key.toLowerCase();
        if (k === "k" || k === "p") {
          navigate({ page: "search" });
          setQuery("");
        }
        if (k === "n" && !onboarding) addTask();
        if (k === "t") setCreateCalendar(true);
        if (k === "s" && data) void save(data.workspace.value, false);
        if (k === ",") navigate({ page: "settings" });
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        ["z", "y"].includes(e.key.toLowerCase()) &&
        !(
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        )
      ) {
        e.preventDefault();
        void undoChange(e.key.toLowerCase() === "y" || e.shiftKey);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const windowAction = (action: "minimize" | "toggleMaximize" | "close") => {
    if (native)
      void getCurrentWindow()
        [action]()
        .catch((e) => setError(String(e)));
  };
  const commands = [
    { name: "New task", run: addTask },
    { name: "New calendar tab", run: () => setCreateCalendar(true) },
    { name: "Calendar", run: () => navigate({ page: "calendar" }) },
    { name: "Settings", run: () => navigate({ page: "settings" }) },
    { name: "Assistant", run: () => navigate({ page: "assistant" }) },
    { name: "Export calendar", run: () => void exportCalendar() },
  ];
  if (!data)
    return (
      <div className="loading">
        <Mark />
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button
              onClick={() =>
                void refresh()
                  .then((d) => setOnboarding(!d.workspace.value.onboarded))
                  .catch((e) => setError(String(e)))
              }
            >
              Retry
            </button>
          </>
        ) : (
          <LoaderCircle
            className="spin"
            size={18}
            aria-label="Loading workspace"
          />
        )}
      </div>
    );
  const d = parseDate(loc.date);
  const first = new Date(d.getFullYear(), d.getMonth(), 1, 12);
  const offset = (day: Date) =>
    (day.getDay() + (appearance.weekStart === "monday" ? 6 : 0)) % 7;
  const start =
    view === "Month"
      ? new Date(d.getFullYear(), d.getMonth(), 1 - offset(first), 12)
      : view === "Week"
        ? new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset(d), 12)
        : d;
  const dayCount =
    view === "Month"
      ? Math.ceil(
          (offset(first) +
            new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()) /
            7,
        ) * 7
      : view === "Week"
        ? 7
        : 1;
  const days = Array.from(
    { length: dayCount },
    (_, i) =>
      new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 12),
  );
  const taskExists = !!calendar?.tasks.some((t) => t.id === edit?.id);
  return (
    <div
      className={`app-shell density-${appearance.density} palette-${appearance.palette} accent-${appearance.accent}`}
      style={
        {
          "--user-font-size": `${appearance.fontSize}px`,
          "--month-row-height": `${appearance.rowHeight}px`,
          "--calendar-row-gap": `${appearance.rowGap}px`,
          "--calendar-column-gap": `${appearance.columnGap}px`,
          "--hour-height": `${appearance.hourHeight}px`,
        } as React.CSSProperties
      }
    >
      <header className="titlebar">
        <IconButton
          label="Back"
          disabled={position === 0}
          onClick={() => setPosition(position - 1)}
        >
          <ArrowLeft size={15} />
        </IconButton>
        <IconButton
          label="Forward"
          disabled={position === history.length - 1}
          onClick={() => setPosition(position + 1)}
        >
          <ArrowRight size={15} />
        </IconButton>
        <IconButton label="Toggle sidebar" onClick={() => setSidebar(!sidebar)}>
          <PanelLeft size={15} />
        </IconButton>
        <div className="menubar" role="menubar" aria-label="Application menu">
          {["File", "Edit", "View", "Help"].map((name) => (
            <div className="menu-wrap" key={name}>
              <button
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={menu === name}
                onClick={() => setMenu(menu === name ? "" : name)}
              >
                {name}
              </button>
              {menu === name && (
                <div
                  className="dropdown"
                  role="menu"
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                      e.preventDefault();
                      const buttons = Array.from(
                        e.currentTarget.querySelectorAll<HTMLButtonElement>(
                          "button:not(:disabled)",
                        ),
                      );
                      const i = buttons.indexOf(
                        document.activeElement as HTMLButtonElement,
                      );
                      buttons[
                        (i + (e.key === "ArrowDown" ? 1 : buttons.length - 1)) %
                          buttons.length
                      ]?.focus();
                    }
                  }}
                >
                  {name === "File" && (
                    <>
                      <button role="menuitem" onClick={addTask}>
                        New task <kbd>Ctrl+N</kbd>
                      </button>
                      <button
                        role="menuitem"
                        onClick={() => {
                          setCreateCalendar(true);
                          setMenu("");
                        }}
                      >
                        New calendar tab <kbd>Ctrl+T</kbd>
                      </button>
                      <button
                        role="menuitem"
                        onClick={() => {
                          setMenu("");
                          void rpc("new_window").catch((e) =>
                            setError(String(e)),
                          );
                        }}
                      >
                        New window
                      </button>
                      <hr />
                      <button
                        role="menuitem"
                        disabled={busy}
                        onClick={() => {
                          setMenu("");
                          void save(data.workspace.value, false);
                        }}
                      >
                        Save calendar <kbd>Ctrl+S</kbd>
                      </button>
                      <button
                        role="menuitem"
                        onClick={() => void exportCalendar()}
                      >
                        Export calendar (.ics)
                      </button>
                    </>
                  )}
                  {name === "Edit" && (
                    <>
                      <button
                        role="menuitem"
                        disabled={!undo.length || busy}
                        onClick={() => {
                          setMenu("");
                          void undoChange();
                        }}
                      >
                        Undo <kbd>Ctrl+Z</kbd>
                      </button>
                      <button
                        role="menuitem"
                        disabled={!redo.length || busy}
                        onClick={() => {
                          setMenu("");
                          void undoChange(true);
                        }}
                      >
                        Redo <kbd>Ctrl+Y</kbd>
                      </button>
                      <hr />
                      <button role="menuitem" onClick={addTask}>
                        Add task and choose color
                      </button>
                      <button
                        role="menuitem"
                        onClick={() => {
                          setMenu("");
                          navigate({ page: "search" });
                          setQuery("");
                        }}
                      >
                        Find a task… <kbd>Ctrl+P</kbd>
                      </button>
                      <hr />
                      <button
                        role="menuitem"
                        onClick={() => navigate({ page: "settings" })}
                      >
                        Settings <kbd>Ctrl+,</kbd>
                      </button>
                    </>
                  )}
                  {name === "View" && (
                    <>
                      <button
                        role="menuitem"
                        onClick={() => {
                          setSidebar(!sidebar);
                          setMenu("");
                        }}
                      >
                        {sidebar ? "Hide" : "Show"} sidebar
                      </button>
                      <button
                        role="menuitem"
                        onClick={() => {
                          navigate({ page: "assistant" });
                          setMenu("");
                        }}
                      >
                        Open assistant
                      </button>
                      <hr />
                      {["Month", "Week", "Day"].map((v) => (
                        <button
                          role="menuitem"
                          key={v}
                          onClick={() => {
                            setView(v);
                            navigate({ page: "calendar" });
                          }}
                        >
                          {v}
                          {view === v && <Check size={14} />}
                        </button>
                      ))}
                    </>
                  )}
                  {name === "Help" && (
                    <>
                      <button
                        role="menuitem"
                        onClick={() => {
                          setMenu("");
                          setHelp(true);
                        }}
                      >
                        About & shortcuts
                      </button>
                      <button
                        role="menuitem"
                        onClick={() => {
                          setMenu("");
                          setOnboarding(true);
                        }}
                      >
                        Onboarding
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        <div
          className="drag-region"
          data-tauri-drag-region
          onDoubleClick={() => windowAction("toggleMaximize")}
        >
          <div
            className="title-search-box"
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <input
              className="title-search"
              aria-label="Search workspace"
              placeholder="Search tasks…"
              value={titleQuery}
              onChange={(e) => setTitleQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setTitleQuery("");
              }}
            />
            {titleQuery.trim() && (
              <div
                className="title-results"
                role="region"
                aria-label="Quick search results"
              >
                {data.workspace.value.calendars
                  .flatMap((c) =>
                    c.tasks
                      .filter((t) =>
                        (t.title + " " + (t.label || "") + " " + t.description)
                          .toLowerCase()
                          .includes(titleQuery.toLowerCase()),
                      )
                      .map((t) => ({ c, t })),
                  )
                  .slice(0, 12)
                  .map(({ c, t }) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        navigate({
                          page: "calendar",
                          calendarId: c.id,
                          date: t.date,
                        });
                        openTask(t, c.id);
                        setTitleQuery("");
                      }}
                    >
                      {t.title}
                      <small>
                        {t.date} · {c.name}
                      </small>
                    </button>
                  ))}
                <button
                  onClick={() => {
                    setQuery(titleQuery);
                    navigate({ page: "search" });
                    setTitleQuery("");
                  }}
                >
                  All search results
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="window-buttons">
          <button
            aria-label="Minimize window"
            onClick={() => windowAction("minimize")}
          >
            <Minus size={15} />
          </button>
          <button
            aria-label="Maximize window"
            onClick={() => windowAction("toggleMaximize")}
          >
            <Maximize2 size={13} />
          </button>
          <button
            aria-label="Close window"
            onClick={() => windowAction("close")}
          >
            <X size={17} />
          </button>
        </div>
      </header>
      {menu && <div className="menu-dismiss" onClick={() => setMenu("")} />}
      <div className="workspace">
        {sidebar && (
          <nav className="rail" aria-label="Main navigation">
            <IconButton
              label="Calendar"
              onClick={() => navigate({ page: "calendar" })}
            >
              <CalendarDays size={21} />
            </IconButton>
            <IconButton label="New task" onClick={addTask}>
              <Plus size={21} />
            </IconButton>
            <IconButton
              label="Search"
              onClick={() => {
                navigate({ page: "search" });
                setQuery("");
              }}
            >
              <Search size={19} />
            </IconButton>
            <IconButton
              label="Assistant"
              onClick={() => navigate({ page: "assistant" })}
            >
              <MessageSquare size={20} />
            </IconButton>
            <div className="rail-bottom">
              <IconButton
                label="Settings"
                onClick={() => navigate({ page: "settings" })}
              >
                <Settings2 size={20} />
              </IconButton>
              <IconButton label="Help" onClick={() => setHelp(true)}>
                <CircleHelp size={20} />
              </IconButton>
            </div>
          </nav>
        )}
        <div className="content">
          <div className="tabs" role="tablist" aria-label="Calendars">
            {data.workspace.value.calendars.map((c) => (
              <button
                role="tab"
                aria-selected={loc.page === "calendar" && calendar?.id === c.id}
                key={c.id}
                onClick={() => navigate({ page: "calendar", calendarId: c.id })}
              >
                <CalendarDays size={15} />
                {c.name}
              </button>
            ))}
            {taskTabs.map((id) => {
              const task = data.workspace.value.calendars
                .flatMap((c) => c.tasks)
                .find((t) => t.id === id);
              return (
                <div className="task-tab" key={id}>
                  <button
                    role="tab"
                    aria-selected={loc.page === "task" && loc.taskId === id}
                    onClick={() => {
                      if (task)
                        openTask(
                          task,
                          data.workspace.value.calendars.find((c) =>
                            c.tasks.some((t) => t.id === id),
                          )!.id,
                        );
                      else navigate({ page: "task", taskId: id });
                    }}
                  >
                    {task?.title ||
                      openedTasks.current.get(id)?.title ||
                      "Deleted task"}
                  </button>
                  <button
                    aria-label={"Close task tab " + (task?.title || id)}
                    onClick={() => closeTask(id)}
                  >
                    <X size={13} />
                  </button>
                </div>
              );
            })}
            {openedPages.includes("settings") && (
              <button
                role="tab"
                aria-selected={loc.page === "settings"}
                onClick={() => navigate({ page: "settings" })}
              >
                <Settings2 size={15} />
                Settings
              </button>
            )}
            {openedPages.includes("search") && (
              <button
                role="tab"
                aria-selected={loc.page === "search"}
                onClick={() => navigate({ page: "search" })}
              >
                <Search size={15} />
                Search
              </button>
            )}
            {openedPages.includes("assistant") && (
              <button
                role="tab"
                aria-selected={loc.page === "assistant"}
                onClick={() => navigate({ page: "assistant" })}
              >
                <MessageSquare size={15} />
                Assistant
              </button>
            )}
            <IconButton
              label="New calendar tab"
              onClick={() => setCreateCalendar(true)}
            >
              <Plus size={16} />
            </IconButton>
          </div>
          {error && (
            <div className="error" role="alert">
              <span>{error}</span>
              <button
                onClick={() => {
                  void refresh()
                    .then(() => setError(""))
                    .catch((e) => setError(String(e)));
                }}
              >
                Refresh
              </button>
              <button
                onClick={() => {
                  setError("");
                  addTask();
                }}
              >
                Edit manually
              </button>
              <IconButton label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </IconButton>
            </div>
          )}
          {loc.page === "calendar" ? (
            <main className="calendar-main">
              <div className="calendar-toolbar">
                <h1>
                  {d.toLocaleDateString("en", {
                    month: "long",
                    year: "numeric",
                  })}
                </h1>
                <button
                  className="outline"
                  onClick={() =>
                    navigate({ date: today(data.workspace.value.timezone) })
                  }
                >
                  Today
                </button>
                <IconButton label="Previous period" onClick={() => shift(-1)}>
                  <ChevronLeft size={19} />
                </IconButton>
                <IconButton label="Next period" onClick={() => shift(1)}>
                  <ChevronRight size={19} />
                </IconButton>
                <span className="toolbar-spacer" />
                <span className="save-status" role="status">
                  {busy ? "Saving…" : notice}
                </span>
                <select
                  aria-label="Calendar view"
                  value={view}
                  onChange={(e) => setView(e.target.value)}
                >
                  {["Month", "Week", "Day"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
                <button className="add-button" onClick={addTask}>
                  <Plus size={17} />
                  Create
                </button>
              </div>
              <div className="label-bar">
                <span className="muted">Labels</span>
                {(data.workspace.value.labels ?? []).map((l) => (
                  <button
                    className={`label-chip color-${l.color}`}
                    aria-pressed={!labelFilter.includes(l.name)}
                    key={l.name}
                    onClick={() =>
                      setLabelFilter((f) =>
                        f.includes(l.name)
                          ? f.filter((n) => n !== l.name)
                          : [...f, l.name],
                      )
                    }
                  >
                    {!labelFilter.includes(l.name) ? "✓ " : ""}
                    {l.name}
                  </button>
                ))}
                <button onClick={() => setLabelsOpen(true)}>
                  Manage labels
                </button>
                <button
                  onClick={() => {
                    setLabelFilter([]);
                    setTitleQuery("");
                  }}
                >
                  Reset filters
                </button>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={appearance.showCompleted}
                    onChange={(e) => {
                      const next = {
                        ...appearance,
                        showCompleted: e.target.checked,
                      };
                      setAppearance(next);
                      localStorage.setItem(
                        "consilium-appearance",
                        JSON.stringify(next),
                      );
                    }}
                  />
                  Completed
                </label>
              </div>
              {view !== "Month" ? (
                <Timeline
                  hourHeight={appearance.hourHeight}
                  days={days}
                  tasks={(calendar?.tasks ?? []).filter(
                    (t) =>
                      !labelFilter.includes(t.label || "") &&
                      (appearance.showCompleted || !t.completed),
                  )}
                  onEdit={openTask}
                  onComplete={(t) => void toggleTask(t)}
                  busy={busy}
                  onCreate={setEdit}
                  color={(t) =>
                    data.workspace.value.labels?.find((l) => l.name === t.label)
                      ?.color ?? t.color
                  }
                />
              ) : (
                <div
                  className={`calendar-grid view-${view.toLowerCase()}`}
                  style={
                    {
                      "--weeks": Math.ceil(dayCount / 7),
                    } as React.CSSProperties
                  }
                >
                  {view !== "Day" &&
                    (appearance.weekStart === "monday"
                      ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
                      : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
                    ).map((day) => (
                      <div className="weekday" key={day}>
                        {day}
                      </div>
                    ))}
                  {days.map((day) => {
                    const key = dateKey(day);
                    return (
                      <section
                        className={`day-cell ${day.getMonth() !== d.getMonth() ? "outside" : ""} ${key === loc.date ? "selected-day" : ""}`}
                        key={key}
                        aria-label={day.toLocaleDateString("en", {
                          dateStyle: "full",
                        })}
                      >
                        <button
                          className={`day-number ${key === today(data.workspace.value.timezone) ? "is-today" : ""}`}
                          aria-label={`Add task on ${key}`}
                          onClick={() => {
                            navigate({ date: key });
                            setEdit(newTask(key));
                          }}
                        >
                          {view === "Day"
                            ? day.toLocaleDateString("en", {
                                weekday: "long",
                                day: "numeric",
                              })
                            : day.getDate()}
                        </button>
                        <div className="day-tasks">
                          {calendar?.tasks
                            .filter(
                              (t) =>
                                t.date === key &&
                                !labelFilter.includes(t.label || "") &&
                                (appearance.showCompleted || !t.completed),
                            )
                            .sort((a, b) => a.time.localeCompare(b.time))
                            .map((t) => (
                              <TaskButton
                                className={`calendar-task color-${data.workspace.value.labels?.find((l) => l.name === t.label)?.color ?? t.color} ${t.completed ? "completed" : ""}`}
                                key={t.id}
                                task={t}
                                disabled={busy}
                                onOpen={() => openTask(t)}
                                onComplete={() => void toggleTask(t)}
                              >
                                <span className="task-dot" />
                                {t.time && (
                                  <span className="task-time">{t.time}</span>
                                )}
                                <span>
                                  {t.title}
                                  {t.label && (
                                    <small className="task-label">
                                      {t.label}
                                    </small>
                                  )}
                                </span>
                                {t.completed && <Check size={12} />}
                              </TaskButton>
                            ))}
                        </div>
                        <button
                          className="cell-add"
                          aria-label={`Create task ${key}`}
                          onClick={() => setEdit(newTask(key))}
                        >
                          <Plus size={14} />
                        </button>
                      </section>
                    );
                  })}
                </div>
              )}
            </main>
          ) : null}
          {taskTabs.map((id) => {
            const currentTask = data.workspace.value.calendars
              .flatMap((c) => c.tasks)
              .find((t) => t.id === id);
            if (currentTask) openedTasks.current.set(id, currentTask);
            const task = currentTask || openedTasks.current.get(id);
            return (
              <div
                key={id}
                className="page-container"
                hidden={loc.page !== "task" || loc.taskId !== id}
              >
                {!currentTask && (
                  <p role="alert">
                    This task was removed. Export any unsaved document before
                    closing.
                  </p>
                )}
                {task ? (
                  <TaskWorkspace
                    task={task}
                    settings={data.settings}
                    onEdit={() => setEdit({ ...task })}
                    onComplete={() => void toggleTask(task)}
                    onDirty={(dirty) => {
                      if (dirty) dirtyTasks.current.add(id);
                      else dirtyTasks.current.delete(id);
                    }}
                  />
                ) : (
                  <main className="settings-view">
                    <h1>Task removed</h1>
                    <p>Its document and conversation are retained locally.</p>
                  </main>
                )}
              </div>
            );
          })}
          {openedPages.includes("settings") && (
            <div className="page-container" hidden={loc.page !== "settings"}>
              <SettingsView data={data} refresh={refresh} onError={setError} />
            </div>
          )}
          {openedPages.includes("search") && (
            <main className="search-view" hidden={loc.page !== "search"}>
              <h1>Search</h1>
              <input
                ref={searchInput}
                aria-label="Search tasks and commands"
                placeholder="Search tasks and commands…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <div className="command-results">
                {commands
                  .filter((c) =>
                    c.name.toLowerCase().includes(query.toLowerCase()),
                  )
                  .map((c) => (
                    <button
                      key={c.name}
                      onClick={() => {
                        c.run();
                      }}
                    >
                      {c.name}
                      <ArrowRight size={15} />
                    </button>
                  ))}
                {data.workspace.value.calendars.flatMap((c) =>
                  c.tasks
                    .filter((t) =>
                      t.title.toLowerCase().includes(query.toLowerCase()),
                    )
                    .map((t) => (
                      <button
                        key={t.id}
                        onClick={() => {
                          navigate({
                            page: "calendar",
                            calendarId: c.id,
                            date: t.date,
                          });
                          openTask(t, c.id);
                        }}
                      >
                        {t.title}
                        <small>{t.date}</small>
                      </button>
                    )),
                )}
              </div>
            </main>
          )}
          {openedPages.includes("assistant") && (
            <main
              className="assistant assistant-page"
              hidden={loc.page !== "assistant"}
            >
              <header>
                <h2>Assistant</h2>
                <IconButton
                  label="Close assistant"
                  onClick={() => navigate({ page: "calendar" })}
                >
                  <X size={17} />
                </IconButton>
              </header>
              <p className="muted">
                Describe what you want to make time for. Review suggestions
                before adding them.
              </p>
              <label>
                Starting date
                <input
                  type="date"
                  value={loc.date}
                  onChange={(e) => {
                    if (e.target.value) navigate({ date: e.target.value });
                  }}
                />
              </label>
              <label>
                Schedule request
                <textarea
                  value={request}
                  onChange={(e) => setRequest(e.target.value)}
                  placeholder="Plan 2 hours of learning tomorrow…"
                  rows={5}
                  maxLength={4000}
                />
              </label>
              <button onClick={() => setContextOpen(!contextOpen)}>
                {contextOpen ? "Hide context" : "Context & history"}
              </button>
              {contextOpen && <ContextPanel />}
              <p className="small muted">
                {cloud
                  ? "Sending shares your request, saved context and relevant tasks with " +
                    data.settings.value.provider +
                    "."
                  : "Uses your saved context and relevant tasks locally."}{" "}
                Describe dates, hours and budget naturally. Up to 31 days and 64
                tasks per proposal.
              </p>
              <button
                onClick={() =>
                  void rpc<{
                    context: { personal_revision: number };
                    revision: number;
                    provider: string;
                    settings_revision: number;
                  }>("calendar_context", {
                    calendar_id: calendar?.id,
                    date: loc.date,
                    days: horizonDays,
                    daily_budget: dailyBudget,
                  })
                    .then(setPacket)
                    .catch((e) => setError(String(e)))
                }
              >
                Preview AI context
              </button>
              {packet && (
                <details>
                  <summary>Context for {horizonDays} days</summary>
                  <pre className="context-preview">
                    {JSON.stringify(packet.context, null, 2)}
                  </pre>
                </details>
              )}
              <button
                className="primary"
                disabled={generating || !request.trim()}
                onClick={() => void propose()}
              >
                {generating
                  ? "Thinking…"
                  : cloud
                    ? `Send to ${data.settings.value.provider}`
                    : "Suggest tasks"}
              </button>
              {generating && (
                <button onClick={() => void cancel(requestId.current)}>
                  Cancel
                </button>
              )}
              {!data.settings.value.chat_model && (
                <button
                  className="text-button"
                  onClick={() => navigate({ page: "settings" })}
                >
                  Set up an AI provider
                </button>
              )}
              {suggestion && (
                <div className="suggestions">
                  <h3>Suggested tasks</h3>
                  <p>
                    {suggestion.tasks.length} tasks across{" "}
                    {new Set(suggestion.tasks.map((t) => t.date)).size} days.
                    Review coverage before adding.
                  </p>
                  {suggestion.tasks.map((t) => (
                    <article key={t.id}>
                      <strong>{t.title}</strong>
                      <p>
                        {t.date} · {t.time || "All day"} · {t.minutes} min
                      </p>
                      <p>{t.description}</p>
                    </article>
                  ))}
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void accept()}
                  >
                    Add to calendar
                  </button>
                  <button onClick={() => setSuggestion(null)}>Discard</button>
                </div>
              )}
            </main>
          )}
        </div>
      </div>
      {labelsOpen && (
        <Modal title="Manage labels" onClose={() => setLabelsOpen(false)}>
          <p className="small muted">
            Choose a name and color. Select an existing label below to change
            its color.
          </p>
          <div className="label-manager">
            <input
              aria-label="Label name"
              maxLength={80}
              placeholder="Label name"
              value={labelName}
              onChange={(e) => setLabelName(e.target.value)}
            />
            <fieldset className="label-swatches">
              <legend>Color</legend>
              {colors.map((c) => (
                <button
                  type="button"
                  key={c}
                  className={"color-swatch color-" + c}
                  aria-label={c + " label color"}
                  aria-pressed={labelColor === c}
                  onClick={() => setLabelColor(c)}
                >
                  {labelColor === c && <Check size={16} />}
                </button>
              ))}
            </fieldset>
            <button
              className="primary"
              disabled={!labelName.trim() || busy}
              onClick={() =>
                void save({
                  ...data.workspace.value,
                  labels: [
                    ...(data.workspace.value.labels ?? []).filter(
                      (l) => l.name !== labelName.trim(),
                    ),
                    { name: labelName.trim(), color: labelColor },
                  ],
                }).then((ok) => {
                  if (ok) setLabelName("");
                })
              }
            >
              Save label
            </button>
            {(data.workspace.value.labels ?? []).map((l) => (
              <button
                key={l.name}
                onClick={() => {
                  setLabelName(l.name);
                  setLabelColor(l.color);
                }}
              >
                Edit {l.name}
              </button>
            ))}
          </div>
        </Modal>
      )}
      {onboarding && (
        <div className="onboarding">
          <div className="onboarding-card">
            <Mark />
            <h1>Welcome to Consilium</h1>
            <p className="muted">
              Start with an empty calendar. Add tasks yourself, or connect a
              local model for suggestions.
            </p>
            <label>
              Timezone
              <input
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                placeholder="Asia/Qatar"
              />
            </label>
            <p className="small muted">
              Calendars are saved on this device. You can configure your model
              in Settings.
            </p>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button
              className="primary"
              disabled={busy}
              onClick={() => void finishOnboarding()}
            >
              {native ? "Open calendar" : "Preview calendar"}
            </button>
          </div>
        </div>
      )}
      {edit && (
        <Modal
          title={taskExists ? "Edit task" : "New task"}
          onClose={() => setEdit(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveTask();
            }}
          >
            <label>
              Title
              <input
                autoFocus
                required
                maxLength={300}
                value={edit.title}
                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
                placeholder="Add a title"
              />
            </label>
            <div className="form-row">
              <label>
                Date
                <input
                  type="date"
                  required
                  value={edit.date}
                  onChange={(e) => setEdit({ ...edit, date: e.target.value })}
                />
              </label>
              <label>
                Time
                <input
                  type="time"
                  value={edit.time}
                  onChange={(e) => setEdit({ ...edit, time: e.target.value })}
                />
              </label>
              <label>
                Minutes
                <input
                  type="number"
                  min={1}
                  max={1440}
                  required
                  value={edit.minutes}
                  onChange={(e) =>
                    setEdit({ ...edit, minutes: Number(e.target.value) })
                  }
                />
              </label>
            </div>
            <label className="check-label">
              <input
                type="checkbox"
                checked={!edit.time}
                onChange={(e) =>
                  setEdit({ ...edit, time: e.target.checked ? "" : "09:00" })
                }
              />
              All day
            </label>
            {edit.time && (
              <label>
                End time
                <input
                  type="time"
                  value={(() => {
                    const [h, m] = edit.time.split(":").map(Number);
                    const end = h * 60 + m + edit.minutes;
                    return `${String(Math.floor(end / 60) % 24).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
                  })()}
                  onChange={(e) => {
                    const [h, m] = edit.time.split(":").map(Number);
                    const [eh, em] = e.target.value.split(":").map(Number);
                    const end = eh * 60 + em;
                    const duration =
                      (end === 0 && h * 60 + m > 0 ? 1440 : end) - h * 60 - m;
                    if (duration > 0) setEdit({ ...edit, minutes: duration });
                  }}
                />
              </label>
            )}
            <label>
              Label
              <input
                list="task-labels"
                maxLength={80}
                value={edit.label || ""}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    label: e.target.value,
                    color:
                      data.workspace.value.labels?.find(
                        (l) => l.name === e.target.value,
                      )?.color ?? edit.color,
                  })
                }
              />
              <datalist id="task-labels">
                {data.workspace.value.labels?.map((l) => (
                  <option key={l.name}>{l.name}</option>
                ))}
              </datalist>
            </label>
            {!taskExists && (
              <div className="form-row">
                <label>
                  Repeat
                  <select
                    value={repeat}
                    onChange={(e) => setRepeat(e.target.value)}
                  >
                    <option value="none">Does not repeat</option>
                    <option value="daily">Daily</option>
                    <option value="weekdays">Weekdays</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </label>
                {repeat !== "none" && (
                  <label>
                    {repeat === "weekdays" ? "Calendar days" : "Occurrences"}
                    <input
                      type="number"
                      min={2}
                      max={31}
                      value={repeatCount}
                      onChange={(e) => setRepeatCount(Number(e.target.value))}
                    />
                  </label>
                )}
              </div>
            )}
            <fieldset>
              <legend>
                Task color · existing labels use their saved color
              </legend>
              <div className="color-options">
                {colors.map((c) => (
                  <button
                    type="button"
                    aria-label={`${c} task color`}
                    aria-pressed={edit.color === c}
                    className={`swatch color-${c}`}
                    key={c}
                    onClick={() => setEdit({ ...edit, color: c })}
                  >
                    {edit.color === c && <Check size={16} />}
                  </button>
                ))}
              </div>
            </fieldset>
            <label>
              Description
              <textarea
                value={edit.description}
                onChange={(e) =>
                  setEdit({ ...edit, description: e.target.value })
                }
                rows={3}
                maxLength={12000}
              />
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={edit.completed}
                onChange={(e) =>
                  setEdit({ ...edit, completed: e.target.checked })
                }
              />
              Completed
            </label>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <footer>
              {taskExists && (
                <button
                  type="button"
                  className="danger"
                  disabled={busy}
                  onClick={() => void saveTask(true)}
                >
                  <Trash2 size={16} />
                  Delete task
                </button>
              )}
              <span />
              <button type="button" onClick={() => setEdit(null)}>
                Cancel
              </button>
              <button className="primary" disabled={busy} type="submit">
                Save task
              </button>
            </footer>
          </form>
        </Modal>
      )}
      {createCalendar && (
        <Modal title="New calendar" onClose={() => setCreateCalendar(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const id = crypto.randomUUID();
              void save({
                ...data.workspace.value,
                calendars: [
                  ...data.workspace.value.calendars,
                  { id, name: calendarName.trim(), tasks: [] },
                ],
              }).then((ok) => {
                if (ok) {
                  setCreateCalendar(false);
                  setCalendarName("");
                  navigate({ page: "calendar", calendarId: id });
                }
              });
            }}
          >
            <label>
              Name
              <input
                autoFocus
                value={calendarName}
                required
                maxLength={120}
                onChange={(e) => setCalendarName(e.target.value)}
              />
            </label>
            {error && <p role="alert">{error}</p>}
            <footer>
              <button
                className="primary"
                disabled={busy || !calendarName.trim()}
              >
                Create calendar
              </button>
            </footer>
          </form>
        </Modal>
      )}
      {help && (
        <Modal title="Consilium 1.0" onClose={() => setHelp(false)}>
          <p>A local calendar and personal assistant.</p>
          <p className="muted">
            Ctrl+N · New task
            <br />
            Ctrl+T · New calendar tab
            <br />
            Ctrl+S · Save calendar
            <br />
            Ctrl+K / Ctrl+P · Search
            <br />
            Ctrl+, · Settings
            <br />
            Ctrl+Z / Ctrl+Y · Undo / redo calendar edits
          </p>
          <p className="muted">
            Click a date to add a task. Click a task to edit its details and
            color. Changes save automatically.
          </p>
          <p className="small muted">
            Google Sans · SIL Open Font License.{" "}
            {native
              ? "Desktop app"
              : "Browser preview — saving requires the desktop app."}
          </p>
          <details className="font-license">
            <summary>Font license</summary>
            <pre>{fontLicense}</pre>
          </details>
        </Modal>
      )}
    </div>
  );
}
