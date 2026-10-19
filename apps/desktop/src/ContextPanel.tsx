import { useEffect, useState } from "react";
import { rpc } from "./api";
type Context = {
  revision: number;
  value: { text: string; history: { id: string; at: string; text: string }[] };
};
export function ContextPanel() {
  const [record, setRecord] = useState<Context>();
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<
    { at: string; request: string; tasks: unknown[] }[]
  >([]);
  useEffect(() => {
    void rpc<Context>("calendar_personal_context")
      .then((r) => {
        setRecord(r);
        setText(r.value.text);
      })
      .catch((e) => setMessage(String(e)));
    void rpc<typeof messages>("calendar_messages")
      .then(setMessages)
      .catch(() => {});
  }, []);
  async function save() {
    setBusy(true);
    try {
      await rpc("calendar_save_context", {
        revision: record?.revision ?? 0,
        text,
      });
      setRecord(await rpc<Context>("calendar_personal_context"));
      setMessage("Context saved locally");
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="context-editor">
      <h3>Your context</h3>
      <p className="muted">
        Goals, availability, daily time budget, preferences and learning level.
        Only this current version is sent with requests; history stays local.
      </p>
      <textarea
        aria-label="Personal context"
        rows={9}
        maxLength={12000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="I have 2 hours after 18:00 on weekdays. My goals are…"
      />
      <button disabled={busy || !record} onClick={() => void save()}>
        Save context
      </button>
      <p role="status">{message}</p>
      <details>
        <summary>Context history · {record?.value.history.length ?? 0}</summary>
        {[...(record?.value.history ?? [])].reverse().map((h) => (
          <article key={h.id}>
            <small>{new Date(h.at).toLocaleString()}</small>
            <pre className="context-preview">{h.text}</pre>
            <button onClick={() => setText(h.text)}>Use as draft</button>
          </article>
        ))}
      </details>
      <details>
        <summary>Past requests · {messages.length}</summary>
        {[...messages].reverse().map((m, i) => (
          <article key={i}>
            <small>{new Date(m.at).toLocaleString()}</small>
            <p>{m.request}</p>
            <p className="muted">
              {m.tasks.length} proposed tasks; proposals do not imply
              completion.
            </p>
            <pre className="context-preview">
              {JSON.stringify(m.tasks, null, 2)}
            </pre>
          </article>
        ))}
      </details>
    </section>
  );
}
