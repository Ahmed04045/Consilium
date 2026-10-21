import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
import { createServer } from "node:http";
let mode = "repair",
  calls = 0;
const requests = [];
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
    requests.push(body);
    const content =
      mode === "invalid" || (mode === "repair" && calls === 1)
        ? "{"
        : body.format?.properties?.answer
          ? JSON.stringify({
              answer: "Compare one idea, then write a short reflection.",
            })
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
    WEBVIEW2_USER_DATA_FOLDER: join(vault, "webview-profile"),
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
  // Exercise the real WASM editor in WebView2, with synthetic content and a temporary vault.
  await page
    .getByRole("button", { name: /Manual task/ })
    .first()
    .click();
  const editor = page.frameLocator('iframe[title="Main document editor"]');
  await editor
    .locator("#status")
    .waitFor({ state: "detached", timeout: 60000 });
  const manual = snapshot.workspace.value.calendars[0].tasks.find(
    (t) => t.title === "Manual task",
  );
  assert(manual);
  await page.evaluate(() => {
    const frame = document.querySelector(
      'iframe[title="Main document editor"]',
    );
    frame.contentWindow.postMessage(
      {
        source: "consilium-host",
        kind: "insert_text",
        payload: "A locally saved Wordcraft document.",
      },
      location.origin,
    );
  });
  let document;
  for (let i = 0; i < 60; i++) {
    document = await rpc("workspace_load", {
      task_id: manual.id,
      scope: "task",
    });
    if (document.document.value.text.includes("locally saved")) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  assert(
    document.document.value.text.includes("locally saved"),
    "Real Wordcraft editing reaches SQLite",
  );
  await page.getByRole("status").filter({ hasText: "Saved locally" }).waitFor();
  await page.screenshot({
    path: "../../docs/screenshots/task-workspace-native.png",
  });
  // Capture generated DOCX without opening a native Save dialog.
  const exportedDoc = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const frame = document.querySelector(
          'iframe[title="Main document editor"]',
        );
        const timer = setTimeout(
          () => reject(new Error("No DOCX export received")),
          20000,
        );
        const receive = (event) => {
          if (
            event.source !== frame.contentWindow ||
            event.data?.kind !== "export"
          )
            return;
          event.stopImmediatePropagation();
          removeEventListener("message", receive, true);
          clearTimeout(timer);
          const value = JSON.parse(event.data.payload);
          resolve({
            name: value.name,
            size: value.bytes.length,
            prefix: value.bytes.slice(0, 2),
            bytes: value.bytes,
          });
        };
        addEventListener("message", receive, true);
        frame.contentWindow.postMessage(
          { source: "consilium-host", kind: "export", payload: "" },
          location.origin,
        );
      }),
  );
  assert.deepEqual(exportedDoc.prefix, [80, 75], "DOCX is a ZIP package");
  assert(exportedDoc.size > 1000);
  const savedText = document.document.value.text.trim();
  await page.evaluate(() => {
    document
      .querySelector('iframe[title="Main document editor"]')
      .contentWindow.postMessage(
        {
          source: "consilium-host",
          kind: "insert_text",
          payload: " Temporary replacement.",
        },
        location.origin,
      );
  });
  for (let i = 0; i < 60; i++) {
    document = await rpc("workspace_load", { task_id: manual.id });
    if (document.document.value.text.includes("Temporary replacement")) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  assert(document.document.value.text.includes("Temporary replacement"));
  await page.getByRole("status").filter({ hasText: "Saved locally" }).waitFor();
  const editorFrame = page
    .frames()
    .find((frame) => frame.url().includes("/wordcraft/index.html"));
  await editorFrame.evaluate(async (bytes) => {
    const { receive_file } =
      await import("/wordcraft/generated/consilium_wordcraft.js");
    receive_file("roundtrip.docx", new Uint8Array(bytes));
  }, exportedDoc.bytes);
  for (let i = 0; i < 60; i++) {
    document = await rpc("workspace_load", { task_id: manual.id });
    if (document.document.value.text.trim() === savedText) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.equal(
    document.document.value.text.trim(),
    savedText,
    "DOCX round trip restores the document",
  );
  await page.getByRole("status").filter({ hasText: "Saved locally" }).waitFor();
  await page.getByRole("tab", { name: "Main", exact: true }).click();
  await page.getByRole("tab", { name: "Manual task", exact: true }).click();
  assert.equal(
    await page.locator('iframe[title="Main document editor"]').count(),
    1,
  );
  await rpc("workspace_set_folder", {
    task_id: manual.id,
    scope: "task",
    revision: 0,
    path: vault,
  });
  mode = "repair";
  calls = 0;
  snapshot = await rpc("calendar_snapshot");
  const chatPayload = {
    task_id: manual.id,
    scope: "task",
    revision: 0,
    question: "How should I approach this?",
    provider: snapshot.settings.value.provider,
    settings_revision: snapshot.settings.revision,
    include_document: true,
    document_revision: document.document.revision,
  };
  const chat = await rpc("workspace_chat", chatPayload);
  assert.equal(calls, 2, "Malformed chat repaired once");
  assert.equal(chat.value.length, 2);
  assert(JSON.stringify(requests.at(-2)).includes("locally saved Wordcraft"), "Opted-in document excerpt reaches the model");
  assert(!JSON.stringify(requests).includes(vault), "Linked folder paths are never sent");
  assert.equal(
    (await rpc("calendar_snapshot")).workspace.revision,
    snapshot.workspace.revision,
    "Chat never changes tasks",
  );
  mode = "invalid";
  calls = 0;
  await assert.rejects(
    () => rpc("workspace_chat", { ...chatPayload, revision: chat.revision }),
    /unchanged/,
  );
  assert.equal(calls, 2);
  assert.equal(
    (await rpc("workspace_load", { task_id: manual.id })).chat.revision,
    chat.revision,
  );
  await page.reload();
  await page
    .getByRole("button", { name: /Manual task/ })
    .first()
    .click();
  await editor
    .locator("#status")
    .waitFor({ state: "detached", timeout: 60000 });
  const reopened = await rpc("workspace_load", { task_id: manual.id });
  assert.equal(reopened.document.value.text, document.document.value.text);
  assert.equal(reopened.folder.value.path, vault);
  assert.equal(reopened.chat.value.length, 2);
  await page.getByRole("tab", { name: "AI chat", exact: true }).click();
  await page
    .getByText("Compare one idea, then write a short reflection.", {
      exact: true,
    })
    .waitFor();
  mode = "valid";
  await page.getByLabel("Message", { exact: true }).fill("Give me a practical next step.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  for (let i = 0; i < 60; i++) {
    if ((await rpc("workspace_load", { task_id: manual.id })).chat.value.length === 4) break;
    await new Promise(r => setTimeout(r, 250));
  }
  assert.equal((await rpc("workspace_load", { task_id: manual.id })).chat.value.length, 4, "Chat composer saves a new turn");
  assert(!JSON.stringify(requests.at(-1)).includes("locally saved Wordcraft"), "Document excerpt is excluded by default");
  console.log(
    "Real Wordcraft passed: canvas startup, document edits, SQLite persistence, retained tabs, DOCX round trip, folder links, chat repair/failure and reopen.",
  );
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
