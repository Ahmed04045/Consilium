import { test, expect } from "@playwright/test";
async function desktop(page: import("@playwright/test").Page) {
  // Workspace UI tests use a deterministic editor stub; the native smoke test exercises Wordcraft WASM.
  await page.route("**/wordcraft/index.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<textarea aria-label="Document text"></textarea><script>
  const box=document.querySelector('textarea');const send=(kind,payload='')=>parent.postMessage({source:'consilium-wordcraft',kind,payload},location.origin);
  addEventListener('message',e=>{if(e.source!==parent)return;if(e.data.kind==='load'){box.value=e.data.payload?JSON.parse(e.data.payload).text||'':'';}if(e.data.kind==='saved'&&e.data.payload===JSON.stringify({text:box.value}))send('clean',e.data.payload);if(e.data.kind==='export')send('export',JSON.stringify({name:'document.docx',bytes:[80,75]}));});
  box.oninput=()=>{send('dirty');send('snapshot',JSON.stringify({document:JSON.stringify({text:box.value}),text:box.value}));};send('ready');
  </script>`,
    }),
  );
  await page.addInitScript(() => {
    const key = "consilium-test";
    const initial = {
      workspace: {
        revision: 0,
        value: {
          onboarded: false,
          timezone: "Asia/Qatar",
          calendars: [{ id: "default", name: "Calendar", tasks: [] }],
        },
      },
      settings: {
        revision: 0,
        value: {
          provider: "ollama",
          endpoint: "http://127.0.0.1:11434",
          chat_model: "",
          embedding_model: "",
          context_tokens: 8192,
        },
      },
      indexes: [],
      vault: "Test vault",
    };
    (window as any).__TAURI_INTERNALS__ = {
      invoke: async (command: string, args: any) => {
        const data = JSON.parse(
          localStorage.getItem(key) || JSON.stringify(initial),
        );
        if (command !== "rpc") return;
        if (args.action === "calendar_snapshot") return data;
        if (
          args.action.startsWith("workspace_") ||
          args.action === "choose_task_folder" ||
          args.action === "open_task_folder" ||
          args.action === "export_workspace_document"
        ) {
          const task = data.workspace.value.calendars
            .flatMap((c: any) => c.tasks)
            .find((t: any) => t.id === args.payload.task_id);
          const scope =
            args.payload.scope === "label"
              ? "label:" + task?.label
              : "task:" + task?.id;
          const k = "test-workspace:" + scope;
          const workspace = JSON.parse(
            localStorage.getItem(k) ||
              JSON.stringify({
                scope,
                document: { revision: 0, value: { document: "", text: "" } },
                chat: { revision: 0, value: [] },
                folder: { revision: 0, value: { path: "" } },
              }),
          );
          if (args.action === "workspace_load") return workspace;
          if (args.action === "workspace_save_document") {
            if (localStorage.getItem("force-document-conflict"))
              throw Error(
                "Document changed in another tab or window. Export your draft before reloading.",
              );
            if (workspace.document.revision !== args.payload.revision)
              throw Error("Document conflict");
            workspace.document = {
              revision: workspace.document.revision + 1,
              value: {
                document: args.payload.document,
                text: args.payload.text,
              },
            };
          }
          if (args.action === "choose_task_folder")
            workspace.folder = {
              revision: 1,
              value: { path: "C:\\Synthetic\\History" },
            };
          if (args.action === "workspace_set_folder")
            workspace.folder = { revision: 2, value: { path: "" } };
          if (args.action === "workspace_chat") {
            workspace.chat.revision++;
            workspace.chat.value.push(
              { id: "q", role: "user", content: args.payload.question },
              {
                id: "a",
                role: "assistant",
                content: "A synthetic task answer.",
              },
            );
          }
          localStorage.setItem(k, JSON.stringify(workspace));
          return args.action === "workspace_chat"
            ? workspace.chat
            : args.action === "workspace_save_document"
              ? workspace.document
              : { ok: true };
        }
        if (args.action === "configure") {
          data.settings = {
            revision: data.settings.revision + 1,
            value: args.payload.value,
          };
          localStorage.setItem(key, JSON.stringify(data));
          return { ok: true };
        }
        if (args.action === "test_model") {
          const attempts =
            Number(localStorage.getItem("test-connection-attempts") || 0) + 1;
          localStorage.setItem("test-connection-attempts", String(attempts));
          if (attempts === 1 || attempts === 3)
            throw new Error(
              "Gemini HTTP 503: The provider is temporarily unavailable or overloaded. Please try again shortly.",
            );
          return { ok: true };
        }
        if (args.action === "named_keys") {
          const k = JSON.parse(
            localStorage.getItem("test-keys") || '{"selected":"","keys":[]}',
          );
          if (args.payload.action === "save") {
            if (args.payload.key === "fail")
              throw new Error("Storage unavailable");
            k.keys.push({ id: "saved", name: args.payload.name });
            k.selected = "saved";
          }
          if (args.payload.action === "select") k.selected = args.payload.id;
          if (args.payload.action === "delete") {
            k.keys = k.keys.filter((x: any) => x.id !== args.payload.id);
            k.selected = "";
          }
          localStorage.setItem("test-keys", JSON.stringify(k));
          return k;
        }
        if (args.action === "calendar_personal_context")
          return JSON.parse(
            localStorage.getItem("test-context") ||
              '{"revision":0,"value":{"text":"","history":[]}}',
          );
        if (args.action === "calendar_save_context") {
          const c = JSON.parse(
            localStorage.getItem("test-context") ||
              '{"revision":0,"value":{"text":"","history":[]}}',
          );
          c.revision++;
          c.value.text = args.payload.text;
          c.value.history.push({
            id: String(c.revision),
            at: new Date().toISOString(),
            text: args.payload.text,
          });
          localStorage.setItem("test-context", JSON.stringify(c));
          return { ok: true };
        }
        if (args.action === "calendar_messages") return [];
        if (args.action === "calendar_context")
          return {
            context: { personal_revision: 0 },
            revision: data.workspace.revision,
            settings_revision: 0,
            provider: "ollama",
          };
        if (args.action === "calendar_propose") {
          localStorage.setItem("last-proposal", JSON.stringify(args.payload));
          return { id: "proposal", tasks: [] };
        }

        if (args.action === "calendar_save") {
          if (args.payload.revision !== data.workspace.revision)
            throw new Error("Revision conflict");
          data.workspace = {
            revision: data.workspace.revision + 1,
            value: args.payload.value,
          };
          localStorage.setItem(key, JSON.stringify(data));
          return data.workspace;
        }
        throw new Error("Unsupported test command");
      },
    };
  });
  await page.goto("/?legacy");
  await page
    .getByRole("button", { name: "Open calendar", exact: true })
    .click();
}

test("connection results replace stale errors and require saved settings", async ({
  page,
}) => {
  await desktop(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const check = page.getByRole("button", {
    name: "Test saved model connection",
  });
  await expect(check).toBeDisabled();
  await page.getByLabel("Chat model · exact name").fill("synthetic-model");
  await page.getByRole("button", { name: "Save model settings" }).click();
  await check.click();
  await expect(page.locator(".provider-feedback")).toContainText(
    "temporarily unavailable",
  );
  await check.click();
  await expect(page.locator(".provider-feedback")).toContainText(
    "Connection works",
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
  await check.click();
  await expect(page.locator(".provider-feedback")).toContainText(
    "temporarily unavailable",
  );
  await expect(
    page.getByText("Model returned valid JSON. Connection works."),
  ).toHaveCount(0);
  await page.getByLabel("Chat model · exact name").fill("unsaved-model");
  await expect(check).toBeDisabled();
});

test("labels use a keyboard-accessible dialog and assistant stays a full tab", async ({
  page,
}) => {
  await desktop(page);
  await page.getByRole("button", { name: "Manage labels" }).click();
  const dialog = page.getByRole("dialog", { name: "Manage labels" });
  await dialog.getByLabel("Label name").fill("History");
  await dialog.getByRole("button", { name: "purple label color" }).click();
  await dialog.getByRole("button", { name: "Save label" }).click();
  await expect(
    dialog.getByRole("button", { name: "Edit History" }),
  ).toBeVisible();
  await page.screenshot({ path: "../../docs/screenshots/v2-labels.png" });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".label-chip")).toHaveClass(/color-purple/);
  await page.getByRole("button", { name: "Assistant", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Assistant", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".calendar-grid")).not.toBeVisible();
  await page.getByLabel("Schedule request").fill("Keep this draft");
  await page.getByRole("tab", { name: "Calendar", exact: true }).click();
  await page.getByRole("tab", { name: "Assistant", exact: true }).click();
  await expect(page.getByLabel("Schedule request")).toHaveValue(
    "Keep this draft",
  );
  await page.screenshot({ path: "../../docs/screenshots/v2-assistant.png" });
});

test("calendar customization persists and scales task positions with hour height", async ({
  page,
}) => {
  await desktop(page);
  await page.keyboard.press("Control+n");
  await page.getByLabel("Title", { exact: true }).fill("Timed task");
  await page.getByLabel("Time", { exact: true }).fill("10:15");
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  for (const name of [
    "Height of one hour",
    "Space between calendar rows",
    "Space between calendar columns",
    "Minimum month row height",
  ]) {
    await page.getByRole("slider", { name: new RegExp(name) }).focus();
    await page.keyboard.press("End");
  }
  await page
    .getByRole("combobox", { name: "App palette" })
    .selectOption("carbon");
  await page
    .getByRole("combobox", { name: "Action accent" })
    .selectOption("purple");
  await page.getByRole("tab", { name: "Calendar", exact: true }).click();
  await page.getByLabel("Calendar view", { exact: true }).selectOption("Month");
  await expect(page.locator(".calendar-grid")).toHaveCSS("column-gap", "16px");
  await expect(page.locator(".calendar-grid")).toHaveCSS("row-gap", "16px");
  await page.getByLabel("Calendar view", { exact: true }).selectOption("Day");
  await expect(page.locator(".timeline-task")).toHaveCSS("top", "1230px");
  await expect(page.locator(".timeline-task")).toHaveCSS("height", "60px");
  await expect(page.locator(".timeline-body")).toHaveCSS("height", "2880px");
  await page.reload();
  await expect(page.locator(".app-shell")).toHaveClass(
    /palette-carbon accent-purple/,
  );
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("slider", { name: /Height of one hour/ }),
  ).toHaveValue("120");
  await page.getByRole("button", { name: "Reset appearance" }).click();
  await expect(
    page.getByRole("slider", { name: /Height of one hour/ }),
  ).toHaveValue("60");
});
test("empty calendar, persistent tasks, colors and undo", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await desktop(page);
  await expect(page.locator(".calendar-task")).toHaveCount(0);
  await page.keyboard.press("Control+n");
  await page.getByLabel("Title", { exact: true }).fill("Read about Athens");
  await page.getByRole("button", { name: "purple task color" }).click();
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  await expect(page.locator(".calendar-task")).toHaveCount(1);
  await expect(page.locator(".calendar-task")).toHaveClass(/color-purple/);
  expect(
    await page
      .locator(".calendar-task")
      .evaluate((e) => getComputedStyle(e).backgroundColor),
  ).not.toBe("rgba(0, 0, 0, 0)");
  await page.screenshot({ path: "../../docs/screenshots/task-blocks.png" });
  await page.keyboard.press("Control+z");
  await expect(page.locator(".calendar-task")).toHaveCount(0);
  await page.keyboard.press("Control+y");
  await expect(page.locator(".calendar-task")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".calendar-task")).toHaveCount(1);
  await page.locator(".calendar-task").click();
  await page.getByRole("button", { name: "Edit task", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Completed", { exact: true })
    .check();
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  await page.getByRole("tab", { name: "Calendar", exact: true }).click();
  await expect(page.locator(".calendar-task")).toHaveClass(/completed/);
  await page.locator(".calendar-task").click();
  await page.getByRole("button", { name: "Edit task", exact: true }).click();
  await page.getByRole("button", { name: "Delete task" }).click();
  await page.getByRole("tab", { name: "Calendar", exact: true }).click();
  await expect(page.locator(".calendar-task")).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("tabs, navigation, keyboard menus and single local font", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith("http://127.0.0.1:1537")) external.push(r.url());
  });
  await desktop(page);
  await page.keyboard.press("Control+t");
  await page.getByLabel("Name", { exact: true }).fill("Learning");
  await page
    .getByRole("button", { name: "Create calendar", exact: true })
    .click();
  await expect(page.getByRole("tab", { name: "Learning" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Calendar", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Forward", exact: true }).click();
  await page.getByRole("menuitem", { name: "View", exact: true }).click();
  await page.getByRole("menuitem", { name: "Week", exact: true }).click();
  await expect(page.locator(".timeline-day")).toHaveCount(7);
  await page.keyboard.press("Control+k");
  await page.getByLabel("Search tasks and commands").fill("Settings");
  await page
    .locator(".search-view")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await expect(page.getByLabel("Embedding model · exact name")).toBeVisible();
  await page.getByLabel("Chat model · exact name").fill("draft-model");
  await page.getByRole("tab", { name: "Calendar", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Settings", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Chat model · exact name")).toHaveValue(
    "draft-model",
  );
  await page.getByRole("tab", { name: "Search", exact: true }).click();
  await expect(page.getByLabel("Search tasks and commands")).toHaveValue(
    "Settings",
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.screenshot({ path: "../../docs/screenshots/search.png" });
  const families = await page
    .locator("body *")
    .evaluateAll((nodes) => [
      ...new Set(
        nodes
          .filter((n) => n instanceof HTMLElement && n.innerText.trim())
          .map((n) => getComputedStyle(n).fontFamily),
      ),
    ]);
  expect(families).toEqual(['"Google Sans Variable"']);
  expect(external).toEqual([]);
});
test("neutral calendar layout and preview errors preserve task draft", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?legacy");
  await page.getByRole("button", { name: "Preview calendar" }).click();
  await expect(page.locator(".calendar-task")).toHaveCount(0);
  await page.screenshot({
    path: "../../docs/screenshots/calendar.png",
    fullPage: true,
  });
  await page.keyboard.press("Control+n");
  await page.getByLabel("Title", { exact: true }).fill("Draft");
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Draft");
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "desktop app",
  );
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 940, height: 640 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("popup transitions respect reduced motion and no bottom overflow", async ({
  page,
}) => {
  await desktop(page);
  await page.keyboard.press("Control+n");
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page
      .getByRole("dialog")
      .evaluate((e) => getComputedStyle(e).animationName),
  ).toBe("dialog-enter");
  await page.getByLabel("Title", { exact: true }).fill("A green task");
  await page.screenshot({ path: "../../docs/screenshots/task-editor.png" });
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  await expect(page.locator(".calendar-task")).toHaveClass(/color-green/);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.keyboard.press("Control+n");
  expect(
    await page
      .getByRole("dialog")
      .evaluate((e) => getComputedStyle(e).animationName),
  ).toBe("none");
  await page.keyboard.press("Escape");
  await page.getByLabel("Calendar view", { exact: true }).selectOption("Month");
  await page.setViewportSize({ width: 940, height: 640 });
  expect(
    await page
      .locator(".calendar-grid")
      .evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBe(true);
  expect(
    await page
      .locator(".tabs")
      .evaluate((e) => getComputedStyle(e).scrollbarWidth),
  ).toBe("none");
});

test("title-bar search and dialog/assistant overflow regressions", async ({
  page,
}) => {
  await desktop(page);
  await page
    .getByRole("textbox", { name: "Search workspace", exact: true })
    .fill("anything");
  await expect(
    page.getByRole("region", { name: "Quick search results" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Search workspace", exact: true })
    .fill("");
  await page.getByRole("tab", { name: "Calendar", exact: true }).click();
  await page.keyboard.press("Control+n");
  await page.getByRole("button", { name: "Close dialog", exact: true }).hover();
  await page.waitForTimeout(250);
  expect(
    await page
      .getByRole("dialog")
      .evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: "../../docs/screenshots/dialog-overflow-fixed.png",
  });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Assistant", exact: true }).click();
  await page.getByLabel("Schedule request").fill("a".repeat(1000));
  expect(
    await page
      .locator(".assistant")
      .evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBe(true);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Provider", exact: true })
    .selectOption("gemini");
  await expect(page.getByLabel("Provider endpoint")).toHaveValue(
    "https://generativelanguage.googleapis.com/v1beta",
  );
  await expect(page.getByLabel("Provider API key")).toHaveAttribute(
    "type",
    "password",
  );
  await expect(page.getByLabel("Embedding model · exact name")).toBeDisabled();
});

test("labels, quick search and minute-positioned tasks", async ({ page }) => {
  await desktop(page);
  await page.keyboard.press("Control+n");
  await page.getByLabel("Title", { exact: true }).fill("Read history");
  await page.getByLabel("Label", { exact: true }).fill("Learning");
  await page.getByLabel("Time", { exact: true }).fill("10:15");
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  await expect(page.locator(".label-chip")).toContainText("Learning");
  await page.locator(".label-chip").click();
  await expect(page.locator(".calendar-task")).toHaveCount(0);
  await page.locator(".label-chip").click();
  await page
    .getByRole("textbox", { name: "Search workspace", exact: true })
    .fill("history");
  await page
    .getByRole("region", { name: "Quick search results" })
    .getByRole("button", { name: /Read history/ })
    .click();
  await expect(
    page.getByRole("tab", { name: "Read history", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Calendar", exact: true }).click();
  await page.getByLabel("Calendar view", { exact: true }).selectOption("Day");
  await expect(page.locator(".timeline-task")).toHaveCSS("top", "615px");
  await page.screenshot({ path: "../../docs/screenshots/v1-timeline.png" });
});

test("delayed task hover actions and retained document workspaces", async ({
  page,
}) => {
  await desktop(page);
  await page.keyboard.press("Control+n");
  await page.getByLabel("Title", { exact: true }).fill("A task workspace");
  await page.getByLabel("Label", { exact: true }).fill("History");
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  const task = page.locator(".calendar-task");
  await task.hover();
  await page.waitForTimeout(200);
  await expect(page.getByRole("dialog", { name: /Task preview:/ })).toHaveCount(
    0,
  );
  const preview = page.getByRole("dialog", {
    name: "Task preview: A task workspace",
  });
  await expect(preview).toBeVisible();
  await preview.getByRole("button", { name: "Complete", exact: true }).click();
  await expect(task).toHaveClass(/completed/);
  await expect(
    page.getByRole("tab", { name: "A task workspace", exact: true }),
  ).toHaveCount(0);
  await preview
    .getByRole("button", { name: "Mark incomplete", exact: true })
    .click();
  await expect(task).not.toHaveClass(/completed/);
  await preview.getByRole("button", { name: "Open task", exact: true }).click();
  const doc = page
    .frameLocator('iframe[title="Main document editor"]')
    .getByLabel("Document text");
  await doc.fill("My local document");
  await expect(
    page.getByRole("status").filter({ hasText: "Saved locally" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Choose folder" }).click();
  await expect(page.locator(".folder-path")).toContainText("Synthetic");
  await page.getByRole("tab", { name: "Calendar", exact: true }).click();
  await page
    .getByRole("tab", { name: "A task workspace", exact: true })
    .click();
  await expect(doc).toHaveValue("My local document");
  await page
    .getByRole("button", { name: "Close task tab A task workspace" })
    .click();
  await task.click();
  await expect(doc).toHaveValue("My local document");
  await page.evaluate(() =>
    localStorage.setItem("force-document-conflict", "yes"),
  );
  await doc.fill("Unsaved conflict draft");
  await expect(page.getByRole("alert")).toContainText("changed in another tab");
  await page
    .getByRole("button", { name: "Close task tab A task workspace" })
    .click();
  await expect(doc).toHaveValue("Unsaved conflict draft");
});
test("named key failures preserve input and context has history", async ({
  page,
}) => {
  await desktop(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Provider", exact: true })
    .selectOption("gemini");
  await page.getByLabel("Key name", { exact: true }).fill("Personal");
  await page.getByLabel("Provider API key").fill("fail");
  await page.getByRole("button", { name: "Save and select key" }).click();
  await expect(page.getByLabel("Provider API key")).toHaveValue("fail");
  await page.getByLabel("Provider API key").fill("synthetic-key");
  await page.getByRole("button", { name: "Save and select key" }).click();
  await expect(page.getByLabel("Selected key")).toHaveValue("saved");
  await expect(page.getByLabel("Provider API key")).toHaveValue("");
  await page.getByRole("button", { name: "Assistant", exact: true }).click();
  await page.getByRole("button", { name: "Context & history" }).click();
  await page
    .getByLabel("Personal context")
    .fill("Study weekdays after 18:00 for two hours.");
  await page.getByRole("button", { name: "Save context", exact: true }).click();
  await expect(page.getByText("Context history · 1")).toBeVisible();
  await page.getByLabel("Schedule request").fill("Plan next week");
  await page
    .getByRole("button", { name: "Suggest tasks", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Suggested tasks" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("last-proposal") || "{}").days,
    ),
  ).toBe(31);
});

test("month-end repetition is finite and does not carry into a new task", async ({
  page,
}) => {
  await desktop(page);
  await page.keyboard.press("Control+n");
  await page.getByLabel("Title", { exact: true }).fill("Monthly review");
  await page.getByLabel("Date", { exact: true }).fill("2026-01-31");
  await page
    .getByRole("combobox", { name: "Repeat", exact: true })
    .selectOption("monthly");
  await page.getByLabel("Occurrences", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  const dates = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem("consilium-test")!,
    ).workspace.value.calendars[0].tasks.map((t: any) => t.date),
  );
  expect(dates).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  await page.keyboard.press("Control+n");
  await expect(
    page.getByRole("combobox", { name: "Repeat", exact: true }),
  ).toHaveValue("none");
  await page.getByLabel("Time", { exact: true }).fill("23:30");
  await page.getByLabel("Minutes", { exact: true }).fill("60");
  await page.getByLabel("End time", { exact: true }).fill("00:00");
  await expect(page.getByLabel("Minutes", { exact: true })).toHaveValue("30");
});
