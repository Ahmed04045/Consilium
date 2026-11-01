import { useEffect, useRef, useState } from "react";
import { native } from "../api";
import { call, Data, useWorkspace } from "./state";
export function PhoneAccount() {
  const w = useWorkspace();
  const [status, setStatus] = useState<Data>({}),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [preview, setPreview] = useState<Data | null>(null),
    [connecting, setConnecting] = useState(false);
  const [loading, setLoading] = useState(native);
  const inFlight = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const load = async () => setStatus(await call("next_phone_status"));
  useEffect(() => {
    if (native)
      void load()
        .catch((e) => setError(String(e).replace(/^Error: /, "")))
        .finally(() => setLoading(false));
  }, []);
  async function run(action: string, payload: Data = {}) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await call(action, payload);
      setPassword("");
      await load();
      if (action === "next_phone_sync" && payload.mode === "preview")
        setPreview(result);
      else {
        setPreview(null);
        setMessage(
          result?.message ||
            (action === "next_phone_logout" ? "Signed out" : "Connected"),
        );
        await w.refresh();
      }
    } catch (e) {
      setError(String(e).replace(/^Error: /, ""));
      setPreview(null);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="nx-phone-account">
      <h2>Phone connection</h2>
      <p>
        Sign in on both devices to transfer calendars, labels and task progress.
        Each transfer is reviewed before it runs.
      </p>
      {!native ? (
        <p>Open the desktop app to connect.</p>
      ) : loading ? (
        <p role="status">Loading account…</p>
      ) : !status.configured ? (
        <p>Connection is not configured in this build.</p>
      ) : status.connected ? (
        <>
          <p>
            Signed in on this device{status.email ? ` as ${status.email}` : ""}.
          </p>
          <div className="nx-phone-actions">
            <button
              disabled={busy}
              onClick={() => void run("next_phone_sync", { mode: "preview" })}
            >
              Review sync
            </button>
            <button
              disabled={busy}
              onClick={() => void run("next_phone_verify")}
            >
              Check connection
            </button>
            <button
              disabled={busy}
              onClick={() => void run("next_phone_logout")}
            >
              Sign out
            </button>
          </div>
          <details>
            <summary>What sync includes</summary>
            <p>
              Calendars, labels, tasks, steps, goals and recurrence sync between
              devices. Documents, conversations, networks, folders and API keys
              are excluded from this version.
            </p>
          </details>
          {preview && (
            <div className="nx-phone-review">
              <p>
                {preview.calendars} calendars and {preview.tasks} tasks on this
                computer. {preview.remote_tasks} tasks in your account.
              </p>
              <p>
                Upload sends these calendar records to your account. Download
                replaces this computer’s calendars after making a backup.
              </p>
              {!preview.can_upload && (
                <p>
                  Another device has changes. Download and review them before
                  uploading.
                </p>
              )}
              <div className="nx-phone-actions">
                <button
                  disabled={busy || !preview.can_upload}
                  onClick={() =>
                    void run("next_phone_sync", { ...preview, mode: "upload" })
                  }
                >
                  Upload calendars
                </button>
                <button
                  disabled={busy || !preview.remote_exists}
                  onClick={() =>
                    void run("next_phone_sync", {
                      ...preview,
                      mode: "download",
                    })
                  }
                >
                  Download calendars
                </button>
              </div>
            </div>
          )}
        </>
      ) : !connecting ? (
        <button onClick={() => setConnecting(true)}>Connect with phone</button>
      ) : (
        <form
          ref={form}
          onSubmit={(e) => {
            e.preventDefault();
            void run("next_phone_login", {
              email: email.trim(),
              password,
              signup: false,
            });
          }}
        >
          <label>
            Email
            <input
              type="email"
              autoComplete="username"
              required
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              maxLength={1024}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </label>
          <div className="nx-phone-actions">
            <button type="submit" disabled={busy || !email || !password}>
              Sign in
            </button>
            <button
              type="button"
              disabled={busy || !email || password.length < 12}
              onClick={() => {
                if (form.current?.reportValidity())
                  void run("next_phone_login", {
                    email: email.trim(),
                    password,
                    signup: true,
                  });
              }}
            >
              Create account
            </button>
          </div>
          <small>
            New passwords need at least 12 characters. Confirm your email before
            signing in.
          </small>
        </form>
      )}
      {busy && <p role="status">Working…</p>}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
