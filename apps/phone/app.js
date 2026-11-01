const $ = (id) => document.getElementById(id);
let config,
  session,
  state,
  preview,
  busy = false;
const empty = () => ({
  schema_version: 1,
  calendars: [],
  labels: [],
  tasks: [],
  occurrences: [],
});
const db = await new Promise((resolve, reject) => {
  const r = indexedDB.open("consilium-phone", 1);
  r.onupgradeneeded = () => r.result.createObjectStore("accounts");
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});
function storage(mode, action) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("accounts", mode);
    const request = action(tx.objectStore("accounts"));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
  });
}
const storageKey = () => `${config.project_url}:${session.user.id}`;
async function persist() {
  await storage("readwrite", (s) => s.put(state, storageKey()));
}
async function request(path, body, token) {
  const response = await fetch(config.project_url + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: config.public_key,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
    redirect: "error",
    credentials: "omit",
  });
  const reader = response.body.getReader();
  let chunks = [],
    size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 6000000) {
      await reader.cancel();
      throw Error("Response exceeds limit");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  const text = new TextDecoder().decode(bytes);
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    if (response.ok) throw Error("Invalid account response");
  }
  if (!response.ok) {
    if (response.status === 429)
      throw Error("Too many requests. Try again later.");
    if (response.status === 409)
      throw Error(
        "Another device changed the calendar (409). Review sync again; your edits are still here.",
      );
    if (value?.error_code === "invalid_credentials")
      throw Error("Email or password is incorrect.");
    if (value?.error_code === "email_not_confirmed")
      throw Error("Confirm your email before signing in.");
    const detail = value?.msg || value?.message || value?.error_description;
    throw Error(
      typeof detail === "string" && detail.length <= 300
        ? detail
        : `Account request failed (${response.status}). Check the account service settings and try again.`,
    );
  }
  return value;
}
function readSession(v, expectedUser) {
  if (
    ![v?.access_token, v?.refresh_token, v?.user?.id].every(
      (x) => typeof x === "string" && x.trim(),
    ) ||
    !Number.isFinite(v.expires_in) ||
    v.expires_in <= 0
  )
    throw Error(
      "The account service returned an incomplete session. Sign in again.",
    );
  if (expectedUser && v.user.id !== expectedUser)
    throw Error("Account changed. Sign in again.");
  return { ...v, expiresAt: Date.now() + v.expires_in * 1000 };
}
async function token() {
  if (Date.now() >= session.expiresAt - 60000) {
    const v = await request("/auth/v1/token?grant_type=refresh_token", {
      refresh_token: session.refresh_token,
    });
    session = readSession(v, session.user.id);
  }
  return session.access_token;
}
async function run(work) {
  if (busy) return;
  busy = true;
  $("error").textContent = "";
  $("status").textContent = "Working…";
  document.querySelectorAll("button").forEach((b) => (b.disabled = true));
  try {
    const message = await work();
    $("status").textContent = message || "Done";
  } catch (e) {
    $("error").textContent = e.message;
    $("status").textContent = "";
    preview = null;
  } finally {
    busy = false;
    document.querySelectorAll("button").forEach((b) => (b.disabled = false));
    render();
  }
}
function validate(v) {
  if (
    v?.schema_version !== 1 ||
    new TextEncoder().encode(JSON.stringify(v)).length > 1900000
  )
    throw Error("Unsupported calendar snapshot");
  for (const k of ["calendars", "labels", "tasks", "occurrences"])
    if (!Array.isArray(v[k]) || v[k].length > 5000)
      throw Error("Invalid calendar records");
  if (
    Object.keys(v).some(
      (k) =>
        ![
          "schema_version",
          "calendars",
          "labels",
          "tasks",
          "occurrences",
        ].includes(k),
    )
  )
    throw Error("Unexpected snapshot fields");
  const id = (x) =>
    typeof x === "string" &&
    x.length > 0 &&
    x.length <= 180 &&
    !/[\x00-\x1f]/.test(x);
  const fields = (record, allowed) =>
    record &&
    typeof record === "object" &&
    !Array.isArray(record) &&
    Object.keys(record).every((k) => allowed.includes(k));
  const calendars = new Map(),
    labels = new Map(),
    tasks = new Map();
  for (const c of v.calendars) {
    if (
      !fields(c, ["id", "name", "timezone"]) ||
      !id(c.id) ||
      calendars.has(c.id) ||
      typeof c.name !== "string" ||
      !c.name.trim() ||
      typeof c.timezone !== "string"
    )
      throw Error("Invalid calendar record");
    try {
      new Intl.DateTimeFormat("en", { timeZone: c.timezone });
    } catch {
      throw Error("Invalid calendar timezone");
    }
    calendars.set(c.id, c);
  }
  for (const l of v.labels) {
    if (
      !fields(l, ["id", "name", "color", "calendar_id"]) ||
      !id(l.id) ||
      labels.has(l.id) ||
      typeof l.name !== "string" ||
      typeof l.color !== "string" ||
      (l.calendar_id != null && !calendars.has(l.calendar_id))
    )
      throw Error("Invalid label record");
    labels.set(l.id, l);
  }
  const date = (x) =>
    typeof x === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(x) &&
    Number.isFinite(Date.parse(x)) &&
    new Date(x).toISOString().slice(0, 10) === x;
  const taskFields = [
    "id",
    "calendar_id",
    "title",
    "kind",
    "start_date",
    "end_date",
    "start_time",
    "end_time",
    "timezone",
    "label_id",
    "parent_id",
    "color",
    "description",
    "completed",
    "steps",
    "target",
    "progress",
    "unit",
    "recurrence",
    "deleted",
    "archived",
  ];
  const checkTask = (t) => {
    if (
      !fields(t, taskFields) ||
      !id(t.id) ||
      !calendars.has(t.calendar_id) ||
      typeof t.title !== "string" ||
      !date(t.start_date) ||
      !date(t.end_date) ||
      t.end_date < t.start_date ||
      !["flexible", "timed", "goal"].includes(t.kind)
    )
      throw Error("Invalid task record");
    if (
      t.label_id != null &&
      (!labels.has(t.label_id) ||
        (labels.get(t.label_id).calendar_id != null &&
          labels.get(t.label_id).calendar_id !== t.calendar_id))
    )
      throw Error("Invalid task label");
    if (
      t.steps != null &&
      (!Array.isArray(t.steps) ||
        t.steps.some(
          (step) =>
            !fields(step, ["id", "title", "completed"]) ||
            !id(step.id) ||
            typeof step.title !== "string" ||
            typeof step.completed !== "boolean",
        ))
    )
      throw Error("Invalid task steps");
    if (
      t.recurrence != null &&
      (!fields(t.recurrence, [
        "frequency",
        "interval",
        "weekdays",
        "count",
        "until",
      ]) ||
        !["daily", "weekly", "weekdays", "monthly", "yearly"].includes(
          t.recurrence.frequency,
        ) ||
        !Number.isInteger(t.recurrence.interval) ||
        t.recurrence.interval < 1)
    )
      throw Error("Invalid recurrence record");
  };
  for (const t of v.tasks) {
    checkTask(t);
    if (tasks.has(t.id)) throw Error("Duplicate task");
    tasks.set(t.id, t);
  }
  for (const t of v.tasks) {
    let parent = t.parent_id,
      seen = new Set([t.id]);
    while (parent != null) {
      if (
        seen.has(parent) ||
        !tasks.has(parent) ||
        tasks.get(parent).calendar_id !== t.calendar_id
      )
        throw Error("Invalid task parent");
      seen.add(parent);
      parent = tasks.get(parent).parent_id;
    }
  }
  const occurrences = new Set();
  for (const o of v.occurrences) {
    if (
      !fields(o, ["series_id", "original_date", "task"]) ||
      !tasks.has(o.series_id) ||
      !tasks.get(o.series_id).recurrence ||
      !date(o.original_date)
    )
      throw Error("Invalid occurrence record");
    const identity = o.series_id + "@" + o.original_date;
    if (occurrences.has(identity)) throw Error("Duplicate occurrence");
    occurrences.add(identity);
    if (o.task != null) {
      checkTask(o.task);
      if (
        o.task.id !== o.series_id ||
        o.task.calendar_id !== tasks.get(o.series_id).calendar_id ||
        o.task.recurrence != null
      )
        throw Error("Invalid occurrence override");
    }
  }
  return v;
}
async function login(signup) {
  const email = $("email").value.trim(),
    password = $("password").value;
  if (signup && password.length < 12) throw Error("Use at least 12 characters");
  const v = await request(
    signup ? "/auth/v1/signup?redirect_to=" + encodeURIComponent(location.origin + location.pathname) : "/auth/v1/token?grant_type=password",
    { email, password },
  );
  if (!v.access_token && signup) {
    $("password").value = "";
    return "Account request submitted. Check your email to confirm, then sign in.";
  }
  const nextSession = readSession(v);
  const saved = await storage("readonly", s => s.get(config.project_url+":"+nextSession.user.id));
  if(saved)validate(saved.snapshot);
  state=saved || {snapshot:empty(),revision:0,dirty:false};
  session=nextSession;
  $("password").value="";
  preview = null;
  render();
  return `Signed in as ${v.user.email || email}`;
}
function render() {
  const connected = !!session;
  $("account").hidden = connected;
  $("workspace").hidden = !connected;
  $("signout").hidden = !connected;
  if (!connected) return;
  const selected = $("calendar").value;
  $("calendar").replaceChildren();
  for (const c of state.snapshot.calendars) {
    const o = document.createElement("option");
    o.value = c.id;
    o.textContent = c.name;
    $("calendar").append(o);
  }
  if (state.snapshot.calendars.some((c) => c.id === selected))
    $("calendar").value = selected;
  $("sync-review").hidden = !preview;
  if (preview) {
    $("sync-details").textContent =
      `This phone: ${state.snapshot.tasks.length} tasks${state.dirty ? " (edited)" : ""}. Account: ${preview.payload?.tasks?.length || 0} tasks.`;
    $("push").disabled = busy || state.revision !== preview.revision;
    $("pull").disabled = busy || !preview.revision;
  }
  $("tasks").replaceChildren();
  const calendar = $("calendar").value,
    date = $("date").value;
  const tasks = state.snapshot.tasks.filter(
    (t) =>
      t.calendar_id === calendar &&
      !t.deleted &&
      !t.archived &&
      (t.recurrence || (t.start_date <= date && t.end_date >= date)),
  );
  if (!tasks.length) {
    const p = document.createElement("p");
    p.textContent = calendar
      ? "No tasks for this day."
      : "Upload calendars from the desktop, then download them here.";
    $("tasks").append(p);
  }
  for (const t of tasks) {
    const article = document.createElement("article"),
      heading = document.createElement("h3"),
      p = document.createElement("p");
    heading.textContent = t.title;
    p.textContent = t.description || "";
    article.append(heading, p);
    const meta = document.createElement("small");
    meta.textContent = t.recurrence
      ? `Recurring series · ${t.recurrence.frequency}. Manage occurrences on desktop.`
      : t.kind === "timed"
        ? `${t.start_time}–${t.end_time} · ${t.timezone}`
        : t.kind === "goal"
          ? `${t.start_date}–${t.end_date}`
          : t.start_date;
    article.append(meta);
    if (!t.recurrence) {
      const button = document.createElement("button");
      button.textContent = t.completed ? "Mark incomplete" : "Complete";
      button.disabled = busy;
      button.onclick = () =>
        run(async () => {
          t.completed = !t.completed;
          state.dirty = true;
          preview = null;
          await persist();
        });
      article.append(document.createElement("br"), button);
    }
    $("tasks").append(article);
  }
  $("new-task").querySelector("button").disabled = busy || !calendar;
}
$("login").onsubmit = (e) => {
  e.preventDefault();
  void run(() => login(false));
};
$("signup").onclick = () => run(() => login(true));
$("signout").onclick = () =>
  run(async () => {
    session = null;
    state = null;
    preview = null;
    $("password").value = "";
  });
$("review").onclick = () =>
  run(async () => {
    preview = await request(
      "/rest/v1/rpc/consilium_phone_read",
      {},
      await token(),
    );
    if (preview.payload) validate(preview.payload);
  });
$("pull").onclick = () =>
  run(async () => {
    if (!preview?.payload) throw Error("Review sync first");
    if (
      !confirm(
        "Replace the calendars on this phone? A previous copy will be kept on this device.",
      )
    )
      return;
    state = {
      snapshot: validate(preview.payload),
      revision: preview.revision,
      dirty: false,
      backup: state.snapshot,
    };
    preview = null;
    await persist();
  });
$("push").onclick = () =>
  run(async () => {
    if (!preview || preview.revision !== state.revision)
      throw Error("Download and review changes from the other device first.");
    const revision = await request(
      "/rest/v1/rpc/consilium_phone_save",
      {
        expected_revision: state.revision,
        workspace: validate(state.snapshot),
      },
      await token(),
    );
    state.revision = revision;
    state.dirty = false;
    preview = null;
    await persist();
  });
$("export").onclick = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([JSON.stringify(state.snapshot, null, 2)], {
      type: "application/json",
    }),
  );
  a.download = "consilium-calendar-backup.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$("new-task").onsubmit = (e) => {
  e.preventDefault();
  void run(async () => {
    const calendar = state.snapshot.calendars.find(
      (c) => c.id === $("calendar").value,
    );
    if (!calendar) throw Error("Choose a calendar");
    const date = $("date").value;
    if (!date) throw Error("Choose a day");
    state.snapshot.tasks.push({
      id: crypto.randomUUID(),
      calendar_id: calendar.id,
      title: $("title").value.trim(),
      kind: "flexible",
      start_date: date,
      end_date: date,
      start_time: "",
      end_time: "",
      timezone: calendar.timezone,
      label_id: null,
      parent_id: null,
      color: "green",
      description: "",
      completed: false,
      steps: [],
      target: null,
      progress: 0,
      unit: "",
      recurrence: null,
      deleted: false,
      archived: false,
    });
    state.dirty = true;
    preview = null;
    await persist();
    $("title").value = "";
  });
};
$("calendar").onchange = render;
$("date").onchange = render;
// Confirmation links may include tokens. Do not keep them in browser history.
function handleConfirmation() {
const confirmation = new URLSearchParams(location.hash.slice(1));
if (confirmation.has("access_token") || confirmation.has("error") || confirmation.has("error_code")) {
  history.replaceState(null, "", location.pathname + location.search);
  if (confirmation.has("error") || confirmation.has("error_code")) $("error").textContent = "Email confirmation failed. Open the latest confirmation email or try signing in.";
  else $("status").textContent = "Email confirmed. Sign in to continue.";
}
}
handleConfirmation();
window.addEventListener("hashchange", handleConfirmation);
const today = new Date();
$("date").value =
  `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
try {
  config = await (await fetch(new URL("./config.json", import.meta.url))).json();
  const u = new URL(config.project_url);
  if (
    u.origin !== config.project_url ||
    u.protocol !== "https:" ||
    !u.hostname.endsWith(".supabase.co") ||
    !config.public_key.startsWith("sb_publishable_")
  )
    throw Error("Invalid account configuration");
  render();
} catch (e) {
  $("error").textContent = e.message;
}
