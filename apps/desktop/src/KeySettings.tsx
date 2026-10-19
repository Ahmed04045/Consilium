import { useEffect, useState } from "react";
import { rpc } from "./api";
type Keys = { selected: string; keys: { id: string; name: string }[] };
export function KeySettings({ provider }: { provider: string }) {
  const [keys, setKeys] = useState<Keys>({ selected: "", keys: [] });
  const [name, setName] = useState("");
  const [secret, setSecret] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void rpc<Keys>("named_keys", { provider, action: "list" })
      .then(setKeys)
      .catch((e) => setMessage(String(e)));
  }, [provider]);
  async function run(action: string, extra: object = {}) {
    setBusy(true);
    setMessage("");
    try {
      setKeys(await rpc<Keys>("named_keys", { provider, action, ...extra }));
      if (action === "save") {
        setSecret("");
        setName("");
      }
      setMessage(
        action === "save" ? "Saved, verified and selected" : "Updated",
      );
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset>
      <legend>API keys</legend>
      <label>
        Selected key
        <select
          disabled={busy}
          value={keys.selected}
          onChange={(e) => void run("select", { id: e.target.value })}
        >
          <option value="" disabled>
            Choose a saved key
          </option>
          {keys.keys.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Key name
        <input
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          placeholder="Personal Gemini"
        />
      </label>
      <label>
        Provider API key
        <input
          type="password"
          autoComplete="off"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
        />
      </label>
      <button
        type="button"
        disabled={busy || !name.trim() || !secret.trim()}
        onClick={() => void run("save", { name, key: secret })}
      >
        Save and select key
      </button>
      <button
        type="button"
        disabled={busy || !keys.selected}
        onClick={() => void run("delete", { id: keys.selected })}
      >
        Remove selected key
      </button>
      <p role="status" className="muted">
        {message ||
          "Stored in Windows Credential Manager. Keys never enter calendar exports."}
      </p>
    </fieldset>
  );
}
