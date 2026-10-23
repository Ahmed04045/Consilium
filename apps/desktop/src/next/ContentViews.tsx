import { useEffect, useRef, useState } from "react";
import { Plus, Send, FileText } from "lucide-react";
import {
  WordcraftEditor,
  EditorCommand,
  DocumentSnapshot,
} from "../WordcraftEditor";
import { cancel, rpc, native } from "../api";
import {
  call,
  row,
  uid,
  useWorkspace,
  Data,
  download,
  documentFlushers,
} from "./state";
export function AssistantView({ id }: { id: string }) {
  const w = useWorkspace(),
    record = row(w.data, "thread", id),
    thread = record?.value;
  const [scope, setScope] = useState(id.includes(":") ? id : ""),
    [mode, setMode] = useState(
      id.startsWith("network:") ? "network_creation" : "schedule_chat",
    ),
    [profile, setProfile] = useState(""),
    [draft, setDraft] = useState(""),
    [sending, setSending] = useState(false),
    [context, setContext] = useState<Data | null>(null),
    [proposal, setProposal] = useState<Data | null>(null),
    [requestId, setRequestId] = useState("");
  const destination = thread?.scope || scope,
    profiles = w.data.profile;
  const networkScope = destination.startsWith("network:");
  const effectiveMode = networkScope
    ? "network_creation"
    : (thread?.mode || mode) === "network_creation"
      ? "schedule_chat"
      : thread?.mode || mode;
  const currentProfile = row(
    w.data,
    "profile",
    thread?.profile_id || profile,
  )?.value;
  async function createThread() {
    const value = {
      id: uid(),
      title: "New conversation",
      scope,
      mode: effectiveMode,
      profile_id: profile,
      messages: [],
      summary: "",
      summary_sources: [],
    };
    await w.save("thread", value, 0);
    w.open("thread", value.id, "Conversation");
    return value;
  }
  async function send() {
    setSending(true);
    const rid = uid();
    setRequestId(rid);
    try {
      let t = thread,
        r = record;
      if (!t) {
        t = await createThread();
        r = await call("next_get", { kind: "thread", id: t.id });
      }
      if (!native) throw Error("Model conversations require the desktop app.");
      await rpc(
        "next_send",
        { thread_id: t!.id, revision: r!.revision, request: draft },
        rid,
      );
      setDraft("");
      await w.refresh();
    } catch (e) {
      w.error(e);
    } finally {
      setSending(false);
      setRequestId("");
    }
  }
  return (
    <div className="nx-chat-layout">
      {!thread && (
        <aside className="nx-thread-list">
          <button
            onClick={() => {
              setScope("");
              setDraft("");
            }}
          >
            <Plus size={16} />
            New conversation
          </button>
          {w.data.thread
            .filter((r) => !scope || r.value.scope === scope)
            .slice()
            .reverse()
            .map((r) => (
              <button
                key={r.value.id}
                onClick={() => w.open("thread", r.value.id, r.value.title)}
              >
                {r.value.title}
                <small>{r.value.mode.replaceAll("_", " ")}</small>
              </button>
            ))}
        </aside>
      )}
      <div className="nx-chat">
        <header>
          <h1>{thread?.title || "Assistant"}</h1>
          <div className="nx-fields">
            {thread ? (
              <label>
                Destination
                <span>
                  {destination.split(":")[0]} ·{" "}
                  {row(
                    w.data,
                    destination.split(":")[0],
                    destination.split(":")[1],
                  )?.value.name ||
                    row(
                      w.data,
                      destination.split(":")[0],
                      destination.split(":")[1],
                    )?.value.title}
                </span>
                <button
                  onClick={() =>
                    w.open("assistant", destination, "New conversation")
                  }
                >
                  New thread
                </button>
              </label>
            ) : (
              <label>
                Destination
                <select
                  value={scope}
                  onChange={(e) => {
                    setScope(e.target.value);
                    setMode(
                      e.target.value.startsWith("network:")
                        ? "network_creation"
                        : "schedule_chat",
                    );
                  }}
                >
                  <option value="">Choose a destination</option>
                  {["calendar", "label", "task", "network"].map((kind) => (
                    <optgroup label={kind} key={kind}>
                      {w.data[kind]
                        .filter((r) => !r.value.deleted)
                        .map((r) => (
                          <option
                            key={r.value.id}
                            value={`${kind}:${r.value.id}`}
                          >
                            {r.value.name || r.value.title}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            )}
            {networkScope ? (
              <label>
                Working on<span>Build & discuss network</span>
                <small>
                  Ask for changes to receive a graph proposal for review.
                </small>
              </label>
            ) : (
              <label>
                Mode
                <select
                  value={effectiveMode}
                  onChange={(e) => {
                    if (thread)
                      void w
                        .save(
                          "thread",
                          { ...thread, mode: e.target.value },
                          record!.revision,
                        )
                        .catch(w.error);
                    else setMode(e.target.value);
                  }}
                >
                  <option value="schedule_chat">Schedule chat</option>
                  <option value="schedule_planning">Schedule planning</option>
                </select>
              </label>
            )}
            <label>
              Model profile
              <select
                value={thread?.profile_id || profile}
                onChange={(e) => {
                  if (thread)
                    void w
                      .save(
                        "thread",
                        { ...thread, profile_id: e.target.value },
                        record!.revision,
                      )
                      .catch(w.error);
                  else setProfile(e.target.value);
                }}
              >
                <option value="">Choose a profile</option>
                {profiles.map((r) => (
                  <option key={r.value.id} value={r.value.id}>
                    {r.value.name} · {r.value.model}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>
        <div className="nx-messages">
          {!thread?.messages.length && (
            <div className="nx-chat-empty">
              <MessageGlyph />
              <h2>What would you like to work on?</h2>
              <p>
                Choose a destination and model. Changes are proposed for review.
              </p>
              {!profiles.length && (
                <button onClick={() => w.open("settings")}>
                  Set up a model profile
                </button>
              )}
            </div>
          )}
          {thread?.messages.map((m: Data) => (
            <article key={m.id} className={m.role}>
              <small>{m.role === "user" ? "You" : "Consilium"}</small>
              <div>{m.content}</div>
              {m.proposal_id && (
                <button
                  onClick={() =>
                    setProposal(
                      row(w.data, "changeset", m.proposal_id)?.value || null,
                    )
                  }
                >
                  Review proposed changes
                </button>
              )}
            </article>
          ))}
        </div>
        <form
          className="nx-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            aria-label="Message"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask, explore or plan…"
            rows={3}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <footer>
            <small>
              {currentProfile
                ? `${currentProfile.provider} · ${currentProfile.model}`
                : "Choose a model profile"}
            </small>
            <span className="nx-spacer" />
            {thread && (
              <button
                type="button"
                onClick={() =>
                  void call("next_context", {
                    thread_id: thread.id,
                    request: draft,
                  })
                    .then(setContext)
                    .catch(w.error)
                }
              >
                Context
              </button>
            )}
            {sending ? (
              <button type="button" onClick={() => void cancel(requestId)}>
                Cancel
              </button>
            ) : (
              <button
                className="nx-primary"
                disabled={!draft.trim() || !destination || !currentProfile}
              >
                <Send size={16} />
                Send
              </button>
            )}
          </footer>
        </form>
      </div>
      {context && (
        <div className="nx-overlay">
          <div className="nx-dialog">
            <header>
              <h2>Context · bounded to this destination</h2>
              <button onClick={() => setContext(null)}>Close</button>
            </header>
            <p>
              {context.provider} · {context.model} · conservative budget{" "}
              {context.estimated_token_upper_bound} tokens
            </p>
            <pre>{JSON.stringify(context.context, null, 2)}</pre>
          </div>
        </div>
      )}
      {proposal && (
        <div className="nx-overlay">
          <div className="nx-dialog nx-wide">
            <header>
              <h2>Review changes</h2>
              <button onClick={() => setProposal(null)}>Close</button>
            </header>
            <p>{proposal.summary}</p>
            {proposal.changes.map((c: Data) => (
              <section key={c.id}>
                <h3>
                  {c.kind} · {c.value.title || c.value.name}
                </h3>
                <div className="nx-diff">
                  <div>
                    <small>Before · revision {c.expected_revision}</small>
                    <ProposalSummary
                      kind={c.kind}
                      value={row(w.data, c.kind, c.id)?.value}
                    />
                    <details>
                      <summary>Advanced record details</summary>
                      <pre>
                        {JSON.stringify(
                          row(w.data, c.kind, c.id)?.value || null,
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  </div>
                  <div>
                    <small>After</small>
                    <ProposalSummary kind={c.kind} value={c.value} />
                    <details>
                      <summary>Advanced record details</summary>
                      <pre>{JSON.stringify(c.value, null, 2)}</pre>
                    </details>
                  </div>
                </div>
              </section>
            ))}
            <footer>
              <button
                className="nx-primary"
                disabled={proposal.accepted}
                onClick={() =>
                  void call("next_accept_changes", { id: proposal.id })
                    .then(async () => {
                      await w.refresh();
                      setProposal(null);
                    })
                    .catch(w.error)
                }
              >
                {proposal.accepted ? "Accepted" : "Accept changes"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
function MessageGlyph() {
  return <div className="nx-assistant-mark">✦</div>;
}
function ProposalSummary({ kind, value }: { kind: string; value?: Data }) {
  if (!value) return <p>New item</p>;
  if (kind === "network")
    return (
      <>
        <p>
          {value.nodes.length} nodes · {value.edges.length} connections
        </p>
        <ul>
          {value.nodes.map((n: Data) => (
            <li key={n.id}>
              {n.title} · {n.kind.replaceAll("_", " ")}
            </li>
          ))}
        </ul>
        <ul>
          {value.edges.map((e: Data) => (
            <li key={e.id}>
              {value.nodes.find((n: Data) => n.id === e.source)?.title} →{" "}
              {value.nodes.find((n: Data) => n.id === e.target)?.title}
              {e.source_port !== "out" ? ` (${e.source_port})` : ""}
            </li>
          ))}
        </ul>
      </>
    );
  if (kind === "task")
    return (
      <>
        <p>
          {value.title}
          {value.deleted ? " · Deleted" : value.completed ? " · Completed" : ""}
        </p>
        <p>
          {value.start_date} {value.start_time} → {value.end_date}{" "}
          {value.end_time}
        </p>
        <p>{value.description}</p>
      </>
    );
  if (kind === "document")
    return (
      <>
        <p>{value.title}</p>
        <p>{String(value.text || "").slice(0, 1200)}</p>
      </>
    );
  return (
    <p>
      {value.name || value.title} {value.color ? `· ${value.color}` : ""}
    </p>
  );
}
export function DocumentView({ id, active }: { id: string; active: boolean }) {
  const w = useWorkspace(),
    r = row(w.data, "document", id),
    editor = useRef<EditorCommand>(null),
    [dirty, setDirty] = useState(false),
    [status, setStatus] = useState("Saved"),
    [conflict, setConflict] = useState<DocumentSnapshot | null>(null),
    [initial, setInitial] = useState(r?.value.document || ""),
    [editorGeneration, setEditorGeneration] = useState(0),
    [mounted, setMounted] = useState(active);
  const revision = useRef(r?.revision || 0),
    saving = useRef(false),
    dirtyRef = useRef(false),
    savedSnapshot = useRef(r?.value.document || ""),
    waiters = useRef<((saved: boolean) => void)[]>([]);
  function settle(saved: boolean) {
    for (const done of waiters.current.splice(0)) done(saved);
  }
  function flush(): Promise<boolean> {
    // Dirty notifications are asynchronous. A mounted editor must answer a snapshot
    // request before closing, even if its last notification said it was clean.
    if (!editor.current) return Promise.resolve(!dirtyRef.current);
    return new Promise((resolve) => {
      const done = (saved: boolean) => {
        clearTimeout(timer);
        resolve(saved);
      };
      const timer = setTimeout(() => {
        waiters.current = waiters.current.filter((x) => x !== done);
        resolve(false);
      }, 8000);
      waiters.current.push(done);
      editor.current?.send("snapshot");
    });
  }
  useEffect(() => {
    documentFlushers.set(id, flush);
    return () => {
      documentFlushers.delete(id);
      settle(false);
    };
  }, [id]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (dirtyRef.current && !saving.current) editor.current?.send("snapshot");
    }, 1200);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (active) {
      setMounted(true);
    } else setMounted(false); // Navigation flushes before hiding this editor.
  }, [active]);
  useEffect(() => {
    if (!dirtyRef.current && r && r.revision !== revision.current) {
      revision.current = r.revision;
      setInitial(r.value.document || "");
      savedSnapshot.current = r.value.document || "";
      setEditorGeneration((value) => value + 1);
    }
  }, [r?.revision]);
  if (!r) return <p>Document not found.</p>;
  async function snapshot(s: DocumentSnapshot) {
    if (saving.current) return;
    if (s.document === savedSnapshot.current) {
      dirtyRef.current = false;
      setDirty(false);
      settle(true);
      return;
    }
    if (!dirtyRef.current && !waiters.current.length) return;
    dirtyRef.current = true;
    saving.current = true;
    setStatus("Saving…");
    try {
      const result = await w.save(
        "document",
        { ...r!.value, document: s.document, text: s.text },
        revision.current,
      );
      revision.current = result.revision;
      savedSnapshot.current = s.document;
      setInitial(s.document);
      editor.current?.send("saved", s.document);
      setStatus("Saved");
    } catch (e) {
      setConflict(s);
      settle(false);
      setStatus("Conflict · your draft is preserved");
      w.error(e);
    } finally {
      saving.current = false;
    }
  }
  return (
    <div className="nx-document">
      <header className="nx-toolbar">
        <FileText size={20} />
        <h1>{r.value.title}</h1>
        <small>{status}</small>
        <span className="nx-spacer" />
        <button
          onClick={() => editor.current?.send("snapshot")}
          disabled={!dirty}
        >
          Save
        </button>
        <button onClick={() => editor.current?.send("export")}>
          Export document
        </button>
      </header>
      {conflict && (
        <div className="nx-error">
          This document changed in another editor or workflow.{" "}
          <button onClick={() => download("document-draft.json", conflict)}>
            Export my draft
          </button>
          <button
            onClick={() =>
              void w
                .save(
                  "document",
                  {
                    ...r.value,
                    id: uid(),
                    title: r.value.title + " · recovered",
                    ...conflict,
                  },
                  0,
                )
                .then((saved) => {
                  setConflict(null);
                  w.open("document", saved.value.id, saved.value.title);
                })
                .catch(w.error)
            }
          >
            Save as a separate document
          </button>
        </div>
      )}
      {mounted && (
        <WordcraftEditor
          key={editorGeneration}
          ref={editor}
          initial={initial}
          onSnapshot={(s) => void snapshot(s)}
          onDirty={() => {
            dirtyRef.current = true;
            setDirty(true);
            setStatus("Unsaved");
          }}
          onClean={() => {
            dirtyRef.current = false;
            setDirty(false);
            settle(true);
          }}
          onError={w.error}
          onExport={(v) =>
            void call("export_workspace_document", v).catch(w.error)
          }
        />
      )}
    </div>
  );
}
