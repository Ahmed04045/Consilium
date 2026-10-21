import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { cancel, native, rpc } from "./api";
import {
  WordcraftEditor,
  type DocumentSnapshot,
  type EditorCommand,
} from "./WordcraftEditor";
import type { Task, CalendarSnapshot } from "./calendar";
import type { RecordValue } from "./types";
type Message = { id: string; role: string; content: string; at: string };
type Snapshot = {
  scope: string;
  document: RecordValue<DocumentSnapshot>;
  chat: RecordValue<Message[]>;
  folder: RecordValue<{ path: string }>;
};
export function TaskWorkspace({
  task,
  settings,
  onEdit,
  onComplete,
  onDirty,
}: {
  task: Task;
  settings: CalendarSnapshot["settings"];
  onEdit: () => void;
  onComplete: () => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [scope, setScope] = useState("task"),
    [snapshot, setSnapshot] = useState<Snapshot>(),
    [error, setError] = useState(""),
    [status, setStatus] = useState("Loading document…"),
    [message, setMessage] = useState(""),
    [thinking, setThinking] = useState(false),
    [includeDoc, setIncludeDoc] = useState(false),
    [editorVersion, setEditorVersion] = useState(0),
    [side, setSide] = useState("details");
  const editor = useRef<EditorCommand>(null),
    data = useRef<Snapshot | undefined>(undefined),
    pending = useRef<DocumentSnapshot | null>(null),
    saving = useRef(false),
    blocked = useRef(false),
    dirty = useRef(false),
    requestId = useRef("");
  const callback = useRef(onDirty);
  callback.current = onDirty;
  function mark(value: boolean) {
    dirty.current = value;
    callback.current(value);
  }
  const payload = {
    task_id: task.id,
    scope,
    expected_scope: data.current?.scope,
  };
  useEffect(() => {
    let live = true;
    setSnapshot(undefined);
    data.current = undefined;
    blocked.current = false;
    setError("");
    rpc<Snapshot>("workspace_load", { task_id: task.id, scope })
      .then((s) => {
        if (live) {
          data.current = s;
          setSnapshot(s);
          setStatus("Saved locally");
          mark(false);
        }
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
    };
  }, [task.id, scope, editorVersion]);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    let disposed = false,
      unlisten: (() => void) | undefined;
    try {
      if (native)
        void getCurrentWindow()
          .onCloseRequested((e) => {
            if (dirty.current) {
              e.preventDefault();
              setError(
                "The document has unsaved changes. Wait for Saved locally, or export your draft before closing.",
              );
              editor.current?.send("snapshot");
            }
          })
          .then((fn) => {
            if (disposed) fn();
            else unlisten = fn;
          })
          .catch(() => {});
    } catch {
      /* Browser preview has no native close events. */
    }
    return () => {
      disposed = true;
      unlisten?.();
      window.removeEventListener("beforeunload", guard);
    };
  }, []);
  async function persist(value: DocumentSnapshot) {
    if (
      !value ||
      typeof value.document !== "string" ||
      typeof value.text !== "string"
    )
      return;
    pending.current = value;
    mark(true);
    setStatus("Saving…");
    if (saving.current || blocked.current) return;
    saving.current = true;
    try {
      while (pending.current && data.current) {
        const next = pending.current;
        pending.current = null;
        const saved = await rpc<RecordValue<DocumentSnapshot>>(
          "workspace_save_document",
          { ...payload, revision: data.current.document.revision, ...next },
        );
        data.current = { ...data.current, document: saved };
        setSnapshot(data.current);
        if (!pending.current) {
          editor.current?.send("saved", next.document);
        }
      }
    } catch (e) {
      blocked.current = true;
      setStatus("Not saved");
      setError(String(e));
    } finally {
      saving.current = false;
    }
  }
  async function exportDocument(value: { name: string; bytes: number[] }) {
    try {
      await rpc("export_workspace_document", value);
    } catch (e) {
      setError(String(e));
    }
  }
  async function folder(action: string) {
    try {
      await rpc(action, {
        ...payload,
        revision: data.current?.folder.revision,
        path: "",
      });
      const s = await rpc<Snapshot>("workspace_load", payload);
      if (data.current) {
        data.current = { ...data.current, folder: s.folder };
        setSnapshot(data.current);
      }
    } catch (e) {
      setError(String(e));
    }
  }
  async function send() {
    if (!data.current || thinking) return;
    setThinking(true);
    setError("");
    const id = crypto.randomUUID();
    requestId.current = id;
    try {
      const result = await rpc<RecordValue<Message[]>>(
        "workspace_chat",
        {
          ...payload,
          revision: data.current.chat.revision,
          question: message,
          provider: settings.value.provider,
          settings_revision: settings.revision,
          include_document: includeDoc,
          document_revision: data.current.document.revision,
        },
        id,
      );
      if (data.current) {
        data.current = { ...data.current, chat: result };
        setSnapshot(data.current);
      }
      setMessage("");
    } catch (e) {
      setError(String(e));
    } finally {
      setThinking(false);
    }
  }
  const cloud = ["gemini", "openrouter"].includes(settings.value.provider);
  return (
    <main className="task-workspace">
      <header className="task-workspace-header">
        <div>
          <span className="small muted">{task.label || "Task workspace"}</span>
          <h1>{task.title}</h1>
          <span className="small muted">
            {task.date} · {task.time || "All day"} · {task.minutes} min
          </span>
        </div>
        <div className="workspace-actions">
          <button onClick={onComplete} className="primary">
            {task.completed ? "Mark incomplete" : "Complete"}
          </button>
          <button onClick={onEdit}>Edit task</button>
        </div>
      </header>
      {error && (
        <div className="workspace-error" role="alert">
          {error}
          <button onClick={() => setError("")}>Dismiss</button>
        </div>
      )}
      <div className="workspace-document-toolbar">
        <div role="group" aria-label="Document scope">
          <button
            aria-pressed={scope === "task"}
            disabled={dirty.current || thinking}
            onClick={() => setScope("task")}
          >
            Task document
          </button>
          {task.label && (
            <button
              aria-pressed={scope === "label"}
              disabled={dirty.current || thinking}
              onClick={() => setScope("label")}
            >
              {task.label} document
            </button>
          )}
        </div>
        <span role="status" className="small muted">
          {status}
        </span>
        <button
          disabled={!snapshot}
          onClick={() => editor.current?.send("export")}
        >
          Export DOCX
        </button>
        {!blocked.current && (
          <button
            disabled={dirty.current || thinking || !snapshot}
            onClick={() => setEditorVersion((v) => v + 1)}
          >
            Reload workspace
          </button>
        )}
        {blocked.current && (
          <button
            onClick={() => {
              if (
                confirm(
                  "Reload the saved document? Export your unsaved draft first; reloading discards that draft.",
                )
              ) {
                pending.current = null;
                mark(false);
                setEditorVersion((v) => v + 1);
              }
            }}
          >
            Reload saved document
          </button>
        )}
      </div>
      <div className="task-workspace-body">
        <section className="workspace-document" aria-label="Document">
          {snapshot && (
            <WordcraftEditor
              key={scope + editorVersion}
              ref={editor}
              initial={snapshot.document.value.document}
              onSnapshot={(v) => void persist(v)}
              onDirty={() => {
                if (!dirty.current) {
                  mark(true);
                  setStatus("Saving…");
                }
              }}
              onClean={(document) => {
                if (
                  !pending.current &&
                  !blocked.current &&
                  data.current?.document.value.document === document
                ) {
                  mark(false);
                  setStatus("Saved locally");
                }
              }}
              onError={(s) => {
                setError(s);
                setStatus("Editor needs attention");
              }}
              onExport={(v) => void exportDocument(v)}
            />
          )}
        </section>
        <aside className="workspace-side">
          <div role="tablist" aria-label="Task panels">
            <button
              role="tab"
              aria-selected={side === "details"}
              onClick={() => setSide("details")}
            >
              Details
            </button>
            <button
              role="tab"
              aria-selected={side === "chat"}
              onClick={() => setSide("chat")}
            >
              AI chat
            </button>
          </div>
          {side === "details" ? (
            <>
              <h2>
                {scope === "label" ? `${task.label} workspace` : "Task details"}
              </h2>
              <p>{task.description || "Add a description with Edit task."}</p>
              <h3>Linked folder</h3>
              <p className="folder-path">
                {snapshot?.folder.value.path || "No folder linked"}
              </p>
              <div className="workspace-actions">
                <button onClick={() => void folder("choose_task_folder")}>
                  Choose folder
                </button>
                {snapshot?.folder.value.path && (
                  <>
                    <button onClick={() => void folder("open_task_folder")}>
                      Open folder
                    </button>
                    <button onClick={() => void folder("workspace_set_folder")}>
                      Unlink
                    </button>
                  </>
                )}
              </div>
              <p className="small muted">
                Folder links stay on this PC. Files are not read or uploaded
                automatically.
              </p>
            </>
          ) : (
            <>
              <h2>{scope === "label" ? `${task.label} chat` : "Task chat"}</h2>
              <div className="workspace-messages" aria-live="polite">
                {snapshot?.chat.value.map((m) => (
                  <article key={m.id} className={`message-${m.role}`}>
                    <strong>{m.role === "user" ? "You" : "Assistant"}</strong>
                    <p>{m.content}</p>
                  </article>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <label>
                  Message
                  <textarea
                    rows={4}
                    maxLength={4000}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Ask about this task…"
                  />
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={includeDoc}
                    onChange={(e) => setIncludeDoc(e.target.checked)}
                  />
                  Include saved document excerpt
                </label>
                <p className="small muted">
                  {cloud
                    ? `Send to ${settings.value.provider}:`
                    : "Local context:"}{" "}
                  task details, saved personal context and recent messages
                  {includeDoc ? ", plus up to 6,000 document characters" : ""}.
                  Folder contents are excluded. Chat cannot change tasks yet.
                </p>
                <button
                  className="primary"
                  disabled={
                    thinking ||
                    !message.trim() ||
                    !settings.value.chat_model ||
                    (includeDoc && dirty.current)
                  }
                >
                  {thinking
                    ? "Thinking…"
                    : cloud
                      ? `Send to ${settings.value.provider}`
                      : "Send"}
                </button>
                {thinking && (
                  <button
                    type="button"
                    onClick={() => void cancel(requestId.current)}
                  >
                    Cancel
                  </button>
                )}
              </form>
            </>
          )}
        </aside>
      </div>
    </main>
  );
}
