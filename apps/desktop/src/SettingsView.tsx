import { Customization } from "./Customization";
import { KeySettings } from "./KeySettings";
import { useState } from "react";
import { rpc } from "./api";
import type { CalendarSnapshot } from "./calendar";
export function SettingsView({
  data,
  refresh,
  onError,
}: {
  data: CalendarSnapshot;
  refresh: () => Promise<CalendarSnapshot>;
  onError: (s: string) => void;
}) {
  const [settings, setSettings] = useState(data.settings.value);
  const cloud = ["gemini", "openrouter"].includes(settings.provider);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function run(action: string, payload: unknown = {}) {
    setBusy(true);
    setMessage("");
    try {
      await rpc(action, payload);
      await refresh();
      setMessage(
        action === "test_model"
          ? "Model returned valid JSON. Connection works."
          : "Saved",
      );
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="settings-view">
      <h1>Settings</h1>
      <Customization />
      <section>
        <h2>AI provider</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run("configure", {
              revision: data.settings.revision,
              value: settings,
            });
          }}
        >
          <label>
            Provider
            <select
              value={settings.provider}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  provider: e.target.value,
                  endpoint:
                    e.target.value === "ollama"
                      ? "http://127.0.0.1:11434"
                      : e.target.value === "gemini"
                        ? "https://generativelanguage.googleapis.com/v1beta/openai"
                        : e.target.value === "openrouter"
                          ? "https://openrouter.ai/api/v1"
                          : "http://127.0.0.1:1234/v1",
                  embedding_model: "",
                  context_tokens: ["gemini", "openrouter"].includes(
                    e.target.value,
                  )
                    ? 32768
                    : 8192,
                })
              }
            >
              <option value="ollama">Ollama</option>
              <option value="openai">
                LM Studio / OpenAI-compatible local server
              </option>
              <option value="gemini">Gemini API</option>
              <option value="openrouter">OpenRouter API</option>
            </select>
          </label>
          <label>
            Provider endpoint
            <input
              required
              readOnly={cloud}
              value={settings.endpoint}
              onChange={(e) =>
                setSettings({ ...settings, endpoint: e.target.value })
              }
            />
          </label>
          <label>
            Chat model · exact name
            <input
              value={settings.chat_model}
              onChange={(e) =>
                setSettings({ ...settings, chat_model: e.target.value })
              }
              placeholder={
                cloud
                  ? "Exact provider model ID"
                  : "Choose a model installed on your computer"
              }
            />
          </label>
          <label>
            Embedding model · exact name
            <input
              disabled={cloud}
              value={settings.embedding_model}
              onChange={(e) =>
                setSettings({ ...settings, embedding_model: e.target.value })
              }
              placeholder="Optional, including model tag"
            />
          </label>
          {cloud && (
            <KeySettings key={settings.provider} provider={settings.provider} />
          )}
          <label>
            Context window
            <input
              type="number"
              min={2048}
              max={131072}
              value={settings.context_tokens}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  context_tokens: Number(e.target.value),
                })
              }
            />
          </label>
          <button className="primary" disabled={busy}>
            Save model settings
          </button>
          <span className="muted" role="status">
            {busy ? "Working…" : message}
          </span>
        </form>
      </section>
      <button disabled={busy} onClick={() => void run("test_model")}>
        Test saved model connection
      </button>

      <section>
        <h2>Embedding index</h2>
        <p className="muted">
          Model changes create a separate index. Lexical search remains
          available while it rebuilds.
        </p>
        {data.indexes.length === 0 && (
          <p className="muted">No embedding index configured.</p>
        )}
        {data.indexes.map((i) => (
          <article className="index-status" key={i.id}>
            <strong>{i.identity.model_name}</strong>
            <p>
              {i.status} · {i.done} / {i.total} chunks · {i.identity.dimensions}{" "}
              dimensions
            </p>
            <progress
              value={i.done}
              max={Math.max(1, i.total)}
              aria-label="Embedding progress"
            />
            <p className="small muted">
              {i.identity.model_fingerprint
                ? `Fingerprint: ${i.identity.model_fingerprint}`
                : "No fingerprint available. In-place model replacements may require a force rebuild."}
            </p>
            {i.failed > 0 && (
              <button
                disabled={busy}
                onClick={() => void run("retry_index", { id: i.id })}
              >
                Retry failed jobs
              </button>
            )}
          </article>
        ))}
        <button
          disabled={busy || !data.settings.value.embedding_model}
          onClick={() => void run("rebuild")}
        >
          Force rebuild
        </button>
        <button
          disabled={busy}
          onClick={() => void refresh().catch((e) => onError(String(e)))}
        >
          Refresh status
        </button>
      </section>
      <section>
        <h2>Storage</h2>
        <p className="muted">{data.vault}</p>
        <p className="small muted">
          Timezone: {data.workspace.value.timezone}. Calendars are stored
          locally in the vault. Existing notes and resources are retained, but
          are not shown in this interface.
        </p>
        <button disabled={busy} onClick={() => void run("backup")}>
          Create backup
        </button>
        <button disabled={busy} onClick={() => void run("choose_vault")}>
          Choose vault…
        </button>
      </section>
    </main>
  );
}
