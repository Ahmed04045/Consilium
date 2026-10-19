import { useEffect, useState } from "react";
import { rpc } from "./api";
export function AccountSettings({
  refresh,
}: {
  refresh: () => Promise<unknown>;
}) {
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<{
    remote_revision: number;
    local_revision: number;
    remote_exists: boolean;
    can_upload: boolean;
  } | null>(null);
  async function status() {
    const s = await rpc<{
      config: { project_url: string; public_key: string } | null;
      connected: boolean;
      email?: string;
    }>("calendar_account_status");
    if (s.config) {
      setUrl(s.config.project_url);
      setKey(s.config.public_key);
    }
    setConnected(s.connected);
    if (s.email) setEmail(s.email);
  }
  useEffect(() => {
    void status().catch(() => {});
  }, []);
  async function run(action: string, payload: unknown = {}) {
    setBusy(true);
    setMessage("");
    if (action !== "calendar_sync") setPreview(null);
    try {
      const result = await rpc<any>(action, payload);
      setMessage(result?.message || "Done");
      await status();
      await refresh();
      return result;
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h2>Account & calendar sync</h2>
      <p className="muted">
        Optional Supabase synchronization. Only calendars and timezone are
        uploaded; API keys, notes and model settings stay on this device.
      </p>
      <p className="small muted">
        Apply the included Consilium migration to your project first. Sync uses
        explicit upload/download snapshots and never silently overwrites a
        conflict.
      </p>
      <label>
        Supabase project URL
        <input
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setPreview(null);
          }}
          placeholder="https://PROJECT.supabase.co"
        />
      </label>
      <label>
        Supabase publishable key
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sb_publishable_…"
        />
      </label>
      <button
        disabled={busy}
        onClick={() =>
          void run("calendar_account_config", {
            project_url: url,
            public_key: key,
          })
        }
      >
        Save sync configuration
      </button>
      {!connected ? (
        <>
          <label>
            Email
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button
            disabled={busy || !email || !password}
            onClick={() => {
              void run("calendar_account_login", {
                email,
                password,
                signup: false,
              }).then(() => setPassword(""));
            }}
          >
            Sign in
          </button>
          <button
            disabled={busy || !email || !password}
            onClick={() => {
              void run("calendar_account_login", {
                email,
                password,
                signup: true,
              }).then(() => setPassword(""));
            }}
          >
            Create account
          </button>
        </>
      ) : (
        <>
          <p>Signed in as {email}</p>
          <button
            disabled={busy}
            onClick={() =>
              void run("calendar_account_logout").then(() => setPreview(null))
            }
          >
            Sign out
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void run("calendar_sync", { mode: "preview" }).then((r) => {
                if (r) setPreview(r);
              })
            }
          >
            Preview sync
          </button>
        </>
      )}
      {preview && (
        <div className="sync-preview">
          <p>
            Local revision {preview.local_revision} · Cloud revision{" "}
            {preview.remote_revision}
          </p>
          <p className="small muted">
            Download replaces this device’s calendars after creating a local
            backup. Upload sends all calendars to your Supabase account.
          </p>
          <button
            disabled={busy || !preview.can_upload}
            onClick={() =>
              void run("calendar_sync", { mode: "upload", ...preview }).then(
                () => setPreview(null),
              )
            }
          >
            Upload calendars
          </button>
          <button
            disabled={busy || !preview.remote_exists}
            onClick={() =>
              void run("calendar_sync", { mode: "download", ...preview }).then(
                () => setPreview(null),
              )
            }
          >
            Back up & download
          </button>
          {!preview.can_upload && (
            <p>Cloud changes must be downloaded before uploading.</p>
          )}
        </div>
      )}
      <p role="status">{busy ? "Working…" : message}</p>
    </section>
  );
}
