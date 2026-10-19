import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
import { createServer } from "node:http";
let mode = "repair",
  calls = 0;
const task = {
  id: "temporary",
  title: "Greek history",
  label: "History",
  date: "2026-10-18",
  time: "09:00",
  minutes: 30,
  color: "purple",
  description: "Compare two ideas.",
  completed: false,
};
const server = createServer(async (req, res) => {
  let input = "";
  for await (const chunk of req) input += chunk;
  const body = input ? JSON.parse(input) : {};
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/api/tags")
    return res.end(
      JSON.stringify({
        models: ["model-a", "model-b", "chat-local"].map((name) => ({
          name,
          digest: `digest-${name}`,
        })),
      }),
    );
  if (req.url === "/api/show") return res.end("{}");
  if (req.url === "/api/embed")
    return res.end(
      JSON.stringify({
        embeddings: [body.model === "model-a" ? [1, 0, 0] : [0, 1, 0]],
      }),
    );
  if (req.url === "/api/chat") {
    calls++;
    const content =
      mode === "invalid" || (mode === "repair" && calls === 1)
        ? "{"
        : JSON.stringify({ tasks: [task] });
    const respond = () =>
      res.end(JSON.stringify({ message: { content }, done: true }));
    if (mode === "slow") setTimeout(respond, 1500);
    else respond();
    return;
  }
  res.statusCode = 404;
  res.end("{}");
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const vault = mkdtempSync(join(tmpdir(), "consilium-calendar-"));
const child = spawn(resolve("../../target/release/consilium-desktop.exe"), [], {
  windowsHide: true,
  env: {
    ...process.env,
    LOCALAPPDATA: vault,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=1541",
  },
});
let browser;
try {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch("http://127.0.0.1:1541/json/version")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await chromium.connectOverCDP("http://127.0.0.1:1541");
  const context = browser.contexts()[0];
  let page;
  for (let i = 0; i < 30; i++) {
    page = context.pages().find((p) => !p.url().startsWith("devtools:"));
    if (page) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  assert(page);
  await page.getByRole("heading", { name: "Welcome to Consilium" }).waitFor();
  await page.screenshot({ path: "../../docs/screenshots/onboarding.png" });
  const rpc = (action, payload = {}) =>
    page.evaluate(
      ({ action, payload }) =>
        window.__TAURI_INTERNALS__.invoke("rpc", {
          requestId: crypto.randomUUID(),
          action,
          payload,
        }),
      { action, payload },
    );
  let snapshot = await rpc("calendar_snapshot");
  assert.equal(snapshot.workspace.value.calendars[0].tasks.length, 0);
  await page
    .getByRole("button", { name: "Open calendar", exact: true })
    .click();
  await page.locator(".onboarding").waitFor({ state: "hidden" });
  assert.equal(
    await page.locator(".tabs").evaluate((e) => getComputedStyle(e).overflowY),
    "hidden",
  );
  await page.screenshot({
    path: "../../docs/screenshots/calendar-empty-native.png",
  });
  await page.keyboard.press("Control+n");
  await page.getByLabel("Title", { exact: true }).fill("Manual task");
  await page.getByRole("button", { name: "green task color" }).click();
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  await page.locator(".calendar-task").waitFor();
  snapshot = await rpc("calendar_snapshot");
  assert.equal(snapshot.workspace.value.calendars[0].tasks[0].color, "green");
  await page.reload();
  await page.locator(".calendar-task").waitFor();
  assert.equal(await page.locator(".onboarding").count(), 0);
  const settings = {
    ...snapshot.settings.value,
    endpoint: `http://127.0.0.1:${server.address().port}`,
    chat_model: "chat-local",
    embedding_model: "model-a",
  };
  await rpc("configure", {
    revision: snapshot.settings.revision,
    value: settings,
  });
  snapshot = await rpc("calendar_snapshot");
  assert.equal(snapshot.indexes[0].identity.model_name, "model-a");
  await rpc("configure", {
    revision: snapshot.settings.revision,
    value: { ...settings, embedding_model: "model-b" },
  });
  snapshot = await rpc("calendar_snapshot");
  assert(snapshot.indexes.some((i) => i.identity.model_name === "model-b"));
  assert(snapshot.indexes.some((i) => i.identity.model_name === "model-a"));
  calls = 0;
  mode = "repair";
  const suggestion = await rpc("calendar_propose", {
    calendar_id: "default",
    date: "2026-10-18",
    request: "Suggest 30 minutes of history",
  });
  assert.equal(calls, 2);
  assert.equal(suggestion.tasks.length, 1);
  assert.equal(
    (await rpc("calendar_snapshot")).workspace.value.calendars[0].tasks.length,
    1,
  );
  await rpc("calendar_accept", { id: suggestion.id });
  snapshot = await rpc("calendar_snapshot");
  assert.equal(snapshot.workspace.value.calendars[0].tasks.length, 2);
  await assert.rejects(
    () => rpc("calendar_accept", { id: suggestion.id }),
    /changed/,
  );
  mode = "invalid";
  calls = 0;
  await assert.rejects(
    () =>
      rpc("calendar_propose", {
        calendar_id: "default",
        date: "2026-10-18",
        request: "Suggest a task",
      }),
    /unchanged/,
  );
  assert.equal(calls, 2);
  assert.equal(
    (await rpc("calendar_snapshot")).workspace.revision,
    snapshot.workspace.revision,
  );
  mode = "slow";
  const cancelled = await page.evaluate(async () => {
    const requestId = crypto.randomUUID();
    const p = window.__TAURI_INTERNALS__
      .invoke("rpc", {
        requestId,
        action: "calendar_propose",
        payload: {
          calendar_id: "default",
          date: "2026-10-18",
          request: "Suggest a task",
        },
      })
      .then(
        () => false,
        (e) => String(e).includes("Cancelled"),
      );
    setTimeout(
      () => window.__TAURI_INTERNALS__.invoke("cancel", { requestId }),
      100,
    );
    return p;
  });
  assert(cancelled);
  const exported = await rpc("calendar_export", { id: "default" });
  assert(exported.text.includes("BEGIN:VCALENDAR"));
  assert(exported.text.includes("Greek history"));
  const stale = structuredClone(snapshot.workspace);
  snapshot.workspace.value.calendars[0].name = "Main";
  await rpc("calendar_save", snapshot.workspace);
  await assert.rejects(() => rpc("calendar_save", stale), /changed/);
  await rpc("backup");
  await page.reload();
  await page.getByRole("tab", { name: "Main", exact: true }).waitFor();
  await page.screenshot({ path: "../../docs/screenshots/calendar-native.png" });
  await rpc("new_window");
  for (let i = 0; i < 30 && context.pages().length < 2; i++)
    await new Promise((r) => setTimeout(r, 100));
  assert(context.pages().length >= 2, "New native window created");
  console.log(
    "Native calendar passed: onboarding, CRUD, persistence, colors, model identity, repair, failed repair, acceptance, cancellation, export, conflicts, backup, new window.",
  );
} finally {
  await browser?.close();
  child.kill();
  server.close();
}
