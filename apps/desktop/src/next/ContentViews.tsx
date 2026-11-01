import { useEffect, useRef, useState } from "react";
import {
  Plus,
  ArrowUp,
  Square,
  FileText,
  CalendarDays,
  Network,
  Tag,
  CheckSquare,
  ChevronDown,
  Paperclip,
  Target,
  Lightbulb,
  MessageSquare,
  RotateCcw,
} from "lucide-react";
import { ComposerMenu } from "./ComposerMenu";
import { ItemActions } from "./ItemActions";
import { Attachments } from "./Attachments";
import { NetworkChecks } from "./NetworkChecks";
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
  WorkspaceContext,
} from "./state";
export function AssistantView({ id, tabId }: { id: string; tabId: string }) {
  const w = useWorkspace();
  const activeId = useRef(id);
  activeId.current = id;
  const [sessions, setSessions] = useState([{ key: uid(), id }]);
  useEffect(() => {
    setSessions((old) =>
      old.some((s) => s.id === id) ? old : [...old, { key: uid(), id }],
    );
  }, [id]);
  return (
    <div className="nx-assistant-sessions">
      {sessions.map((session) => (
        <div
          className="nx-assistant-session"
          key={session.key}
          hidden={session.id !== id}
        >
          <WorkspaceContext.Provider
            value={{
              ...w,
              bindThread: (_tab, newId, title) => {
                setSessions((old) =>
                  old.map((s) =>
                    s.key === session.key ? { ...s, id: newId } : s,
                  ),
                );
                if (activeId.current === session.id)
                  w.bindThread(tabId, newId, title);
              },
            }}
          >
            <AssistantSession id={session.id} tabId={tabId} />
          </WorkspaceContext.Provider>
        </div>
      ))}
    </div>
  );
}
function AssistantSession({ id, tabId }: { id: string; tabId: string }) {
  const w = useWorkspace(),
    record = row(w.data, "thread", id),
    thread = record?.value;
  const [scope, setScope] = useState(
      id.includes(":") && !id.startsWith("draft:") ? id : "",
    ),
    [mode, setMode] = useState(
      id.startsWith("network:") ? "network_creation" : "schedule_planning",
    ),
    [profile, setProfile] = useState(""),
    [draft, setDraft] = useState(""),
    [sending, setSending] = useState(false),
    [context, setContext] = useState<Data | null>(null),
    [proposal, setProposal] = useState<Data | null>(null),
    [requestId, setRequestId] = useState("");
  const [attachments, setAttachments] = useState<Data[]>([]),
    [stage, setStage] = useState("graph"),
    [nodeId, setNodeId] = useState("");
  const attachmentControl = useRef<{ add: () => void }>(null);
  const [intent, setIntent] = useState("chat"),
    [goal, setGoal] = useState(""),
    [advanced, setAdvanced] = useState(false);
  const retryRecord = row(w.data, "layout", "retry:" + id)?.value;
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !retryRecord?.request) return;
    restored.current = true;
    if (
      thread?.messages.some(
        (m: Data) =>
          m.role === "user" &&
          m.content === retryRecord.request &&
          m.at >= retryRecord.sent_at,
      )
    )
      return;
    setPendingPrompt(retryRecord.request);
    setSendError(
      retryRecord.error || "This message was interrupted. You can resend it.",
    );
    setAttachments(retryRecord.attachments || []);
    setIntent(retryRecord.intent || "chat");
    setGoal(retryRecord.goal || "");
  }, [retryRecord]);
  const destinations = ["calendar", "network", "label", "task"].flatMap(
    (kind) =>
      w.data[kind]
        .filter((r) => !r.value.deleted)
        .map((r) => ({
          id: kind + ":" + r.value.id,
          name: r.value.name || r.value.title,
          kind,
        })),
  );
  const destinationIcon = (kind: string) => {
    const Icon =
      (
        {
          calendar: CalendarDays,
          network: Network,
          label: Tag,
          task: CheckSquare,
        } as Record<string, typeof CalendarDays>
      )[kind] || CalendarDays;
    return <Icon size={16} />;
  };
  const inFlight = useRef(false);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [sendError, setSendError] = useState("");
  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ block: "nearest" });
  }, [thread?.messages.length, pendingPrompt, sending]);
  const destination = thread?.scope || scope,
    profiles = w.data.profile;
  const networkScope = destination.startsWith("network:");
  useEffect(() => {
    setStage("graph");
    setNodeId("");
  }, [destination]);
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
  useEffect(() => {
    setAttachments((items) =>
      items.map((f) => ({ ...f, share_content: false })),
    );
  }, [
    currentProfile?.id,
    currentProfile?.provider,
    currentProfile?.model,
    currentProfile?.endpoint,
  ]);
  const scopedNetwork = destination.startsWith("network:")
    ? row(w.data, "network", destination.slice(8))?.value
    : null;
  async function createThread(submitted: string) {
    const value = {
      id: uid(),
      title: submitted.trim().slice(0, 60) || "New conversation",
      scope,
      mode: effectiveMode,
      profile_id: profile,
      messages: [],
      summary: "",
      summary_sources: [],
    };
    await w.save("thread", value, 0);
    w.bindThread(tabId, value.id, value.title);
    return value;
  }
  async function send(retry = false) {
    const submitted = retry ? pendingPrompt || "" : draft;
    if (!retry && sendError) return;
    if (
      inFlight.current ||
      !submitted.trim() ||
      !destination ||
      !currentProfile ||
      (stage !== "graph" && !nodeId)
    )
      return;
    restored.current = true;
    inFlight.current = true;
    setSending(true);
    setPendingPrompt(submitted);
    if (!retry) setDraft("");
    setSendError("");
    const rid = uid();
    setRequestId(rid);
    let sentThreadId = thread?.id;
    const submittedAt = new Date().toISOString();
    try {
      if (!native) throw Error("Model conversations require the desktop app.");
      let t = thread,
        r = record;
      if (!t) {
        t = await createThread(submitted);
      }
      sentThreadId = t!.id;
      const retryId = "retry:" + t!.id;
      await w.save("layout", {
        id: retryId,
        request: submitted,
        attachments,
        intent,
        goal,
        error: "",
        sent_at: submittedAt,
      });
      r = await call("next_get", { kind: "thread", id: t!.id });
      await rpc(
        "next_send",
        {
          thread_id: t!.id,
          revision: r!.revision,
          request: submitted,
          intent,
          goal,
          attachments,
          authoring_stage: stage,
          node_id: nodeId,
        },
        rid,
      );
      setPendingPrompt(null);
      try {
        const retryState = await call("next_get", {
          kind: "layout",
          id: "retry:" + t!.id,
        });
        await w.save(
          "layout",
          { id: "retry:" + t!.id, request: "" },
          retryState.revision,
        );
      } catch (e) {
        w.error(e);
      }
      await w.refresh().catch(w.error);
      setDraft("");
      setAttachments([]);
      setPendingPrompt(null);
    } catch (e) {
      if (sentThreadId) {
        try {
          const committed = await call("next_get", {
            kind: "thread",
            id: sentThreadId,
          });
          if (
            committed?.value.messages?.some(
              (m: Data) =>
                m.role === "user" &&
                m.content === submitted &&
                m.at >= submittedAt,
            )
          ) {
            setPendingPrompt(null);
            setAttachments([]);
            await w.refresh().catch(w.error);
            return;
          }
        } catch {
          /* Preserve the pending message when reconciliation is unavailable. */
        }
      }
      setSendError(String(e).replace(/^Error: /, ""));
      if (sentThreadId) {
        try {
          const previous = await call("next_get", {
            kind: "layout",
            id: "retry:" + sentThreadId,
          });
          await w.save(
            "layout",
            { ...previous.value, error: String(e).replace(/^Error: /, "") },
            previous.revision,
          );
        } catch {
          /* Keep the in-memory retry if storage is unavailable. */
        }
      }
    } finally {
      inFlight.current = false;
      setSending(false);
      setRequestId("");
    }
  }
  return (
    <div className="nx-chat-layout">
      {true && (
        <aside className="nx-thread-list">
          <button
            onClick={() => {
              w.open("assistant", "draft", "New conversation");
            }}
          >
            <Plus size={16} />
            New conversation
          </button>
          {w.data.thread
            .filter((r) => !r.value.deleted)
            .slice()
            .sort((a, b) =>
              (b.updated_at || "").localeCompare(a.updated_at || ""),
            )
            .map((r) => (
              <ItemActions key={r.value.id} kind="thread" id={r.value.id}>
                <button
                  key={r.value.id}
                  onClick={() => w.open("thread", r.value.id, r.value.title)}
                >
                  {r.value.title}
                </button>
              </ItemActions>
            ))}
        </aside>
      )}
      <div className="nx-chat">
        <header>
          <h1>{thread?.title || "Assistant"}</h1>
          <div className="nx-destination-control">
            <ComposerMenu
              label="Destination"
              disabled={sending}
              trigger={
                <>
                  {destination && destinationIcon(destination.split(":")[0])}
                  <span>
                    {destinations.find((d) => d.id === destination)?.name ||
                      "Choose a destination"}
                  </span>
                  <ChevronDown size={14} />
                </>
              }
            >
              {(close) => (
                <>
                  {destinations.length ? (
                    destinations.map((d) => (
                      <button
                        type="button"
                        role="menuitem"
                        key={d.id}
                        onClick={() => {
                          close();
                          if (thread) {
                            w.open("assistant", d.id, "Assistant");
                          } else {
                            setScope(d.id);
                            setMode(
                              d.kind === "network"
                                ? "network_creation"
                                : "schedule_planning",
                            );
                          }
                        }}
                      >
                        {destinationIcon(d.kind)}
                        <span>{d.name}</span>
                      </button>
                    ))
                  ) : (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        close();
                        w.create();
                      }}
                    >
                      Create a new destination
                    </button>
                  )}
                </>
              )}
            </ComposerMenu>
          </div>
        </header>
        <div className="nx-messages">
          {!thread?.messages.length && pendingPrompt === null && (
            <div className="nx-chat-empty">
              <MessageGlyph />
              <h2>What would you like to work on?</h2>
              <p>Ask naturally. I’ll ask when I need more detail.</p>
              {!profiles.length && (
                <button onClick={() => w.open("settings")}>
                  Set up a model profile
                </button>
              )}
            </div>
          )}
          {thread?.messages.map((m: Data) => (
            <article
              key={m.id}
              className={m.role === "user" ? "user" : "nx-assistant-message"}
            >
              <small>{m.role === "user" ? "You" : "Consilium"}</small>
              <div>{m.content}</div>
              {m.attachments?.map((a: Data) => (
                <small key={a.id}>
                  {a.name} ·{" "}
                  {a.shared_with_model
                    ? `${a.content_status} contents shared`
                    : "contents not shared"}{" "}
                  · snapshot {a.digest.slice(0, 8)}{" "}
                </small>
              ))}
              {m.proposal_id && (
                <div className="nx-proposal-card">
                  <span className="nx-proposal-icon">
                    <FileText size={20} />
                  </span>
                  <div>
                    <strong>
                      {row(w.data, "changeset", m.proposal_id)?.value.summary ||
                        "Proposed changes"}
                    </strong>
                    <small>
                      {row(w.data, "changeset", m.proposal_id)?.value.accepted
                        ? "Applied"
                        : (row(w.data, "changeset", m.proposal_id)?.value
                            .changes?.length || 0) +
                          " changes · awaiting your review"}
                    </small>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setProposal(
                        row(w.data, "changeset", m.proposal_id)?.value || null,
                      )
                    }
                  >
                    Review plan
                  </button>
                </div>
              )}
              {m.role === "assistant" &&
                m.title_suggestion &&
                thread &&
                m.title_suggestion !== thread.title && (
                  <button
                    className="nx-title-suggestion"
                    onClick={() => {
                      const title = m.title_suggestion.trim().slice(0, 60);
                      void w
                        .save("thread", { ...thread, title }, record!.revision)
                        .then(() => w.bindThread(tabId, thread.id, title))
                        .catch(w.error);
                    }}
                  >
                    Use title: {m.title_suggestion}
                  </button>
                )}
            </article>
          ))}
          {pendingPrompt !== null && (
            <article className="user" aria-label="Pending message">
              <small>You</small>
              <div>{pendingPrompt}</div>
              {sendError && (
                <div className="nx-retry">
                  <p role="alert">{sendError}</p>
                  <button
                    type="button"
                    disabled={sending || !currentProfile}
                    onClick={() => void send(true)}
                  >
                    <RotateCcw size={15} />
                    Resend message
                  </button>
                  <small>You can choose another model below.</small>
                </div>
              )}
            </article>
          )}
          {sending && (
            <p role="status">
              Waiting for {currentProfile?.provider} · {currentProfile?.model}…
            </p>
          )}
          <div ref={messagesEnd} />
        </div>
        <form
          className="nx-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          {networkScope && advanced && (
            <div className="nx-actions">
              <label>
                Authoring stage
                <select
                  aria-label="Authoring stage"
                  disabled={sending}
                  value={stage}
                  onChange={(e) => setStage(e.target.value)}
                >
                  <option value="graph">Design / edit graph</option>
                  <option value="implement_node">Implement one node</option>
                  <option value="repair_node">Repair one node</option>
                </select>
              </label>
              {stage !== "graph" && (
                <label>
                  Selected node
                  <select
                    aria-label="Selected authoring node"
                    disabled={sending}
                    value={nodeId}
                    onChange={(e) => setNodeId(e.target.value)}
                  >
                    <option value="">Choose a node…</option>
                    {scopedNetwork?.nodes.map((n: Data) => (
                      <option key={n.id} value={n.id}>
                        {n.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
          <Attachments
            ref={attachmentControl}
            hideButton
            files={attachments}
            onChange={setAttachments}
            provider={
              currentProfile
                ? `${currentProfile.provider} · ${currentProfile.model}`
                : "selected model"
            }
            disabled={sending}
          />
          <textarea
            aria-label="Message"
            disabled={sending || !!sendError}
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
          {intent === "goal" && (
            <label className="nx-goal-field">
              Goal
              <input
                aria-label="Conversation goal"
                maxLength={1000}
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="What do you want to achieve?"
                disabled={sending}
              />
            </label>
          )}
          <footer>
            <ComposerMenu
              label="Add files or choose a mode"
              up
              disabled={sending}
              trigger={<Plus size={20} />}
            >
              {(close) => (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      close();
                      attachmentControl.current?.add();
                    }}
                  >
                    <Paperclip size={17} />
                    Add file
                  </button>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={intent === "chat"}
                    onClick={() => {
                      setIntent("chat");
                      close();
                    }}
                  >
                    <MessageSquare size={17} />
                    Chat
                  </button>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={intent === "goal"}
                    onClick={() => {
                      setIntent("goal");
                      close();
                    }}
                  >
                    <Target size={17} />
                    Goal
                  </button>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={intent === "plan"}
                    onClick={() => {
                      setIntent("plan");
                      close();
                    }}
                  >
                    <Lightbulb size={17} />
                    Plan mode
                  </button>
                  {networkScope && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setAdvanced(!advanced);
                        close();
                      }}
                    >
                      Network options
                    </button>
                  )}
                  {thread && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        close();
                        void call("next_context", {
                          thread_id: thread.id,
                          request: draft,
                          attachments,
                        })
                          .then(setContext)
                          .catch(w.error);
                      }}
                    >
                      Inspect context
                    </button>
                  )}
                </>
              )}
            </ComposerMenu>
            {intent !== "chat" && (
              <span className="nx-mode-chip">
                {intent === "goal" ? "Goal" : "Plan"}
              </span>
            )}
            <span className="nx-spacer" />
            <ComposerMenu
              label="Model profile"
              up
              disabled={sending}
              trigger={
                <>
                  <span>{currentProfile?.name || "Choose model"}</span>
                  <ChevronDown size={14} />
                </>
              }
            >
              {(close) => (
                <>
                  {profiles.map((r) => (
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={currentProfile?.id === r.value.id}
                      key={r.value.id}
                      onClick={() => {
                        close();
                        if (thread)
                          void w
                            .save(
                              "thread",
                              { ...thread, profile_id: r.value.id },
                              record!.revision,
                            )
                            .catch(w.error);
                        else setProfile(r.value.id);
                      }}
                    >
                      <span>
                        {r.value.name}
                        <small>
                          {r.value.provider} · {r.value.model}
                        </small>
                      </span>
                    </button>
                  ))}
                  {!profiles.length && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        close();
                        w.open("settings");
                      }}
                    >
                      Set up a model profile
                    </button>
                  )}
                </>
              )}
            </ComposerMenu>
            {sending ? (
              <button
                type="button"
                className="nx-send-icon"
                aria-label="Stop"
                title="Stop generating"
                onClick={() => void cancel(requestId)}
              >
                <Square size={16} fill="currentColor" />
              </button>
            ) : (
              <button
                className="nx-primary nx-send-icon"
                aria-label="Send"
                title={
                  currentProfile
                    ? "Send to " +
                      currentProfile.provider +
                      " · " +
                      currentProfile.model
                    : "Choose a model"
                }
                disabled={
                  !!sendError ||
                  !draft.trim() ||
                  !destination ||
                  !currentProfile ||
                  (stage !== "graph" && !nodeId)
                }
              >
                <ArrowUp size={19} />
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
              {context.provider} · {context.model} · approximately{" "}
              {context.estimated_tokens} tokens of selected context. The full
              request also includes instructions and response contracts; the
              provider's exact token count may differ.
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
                {c.kind === "network" && (
                  <NetworkChecks
                    network={c.value}
                    revision={c.expected_revision + 1}
                  />
                )}
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
