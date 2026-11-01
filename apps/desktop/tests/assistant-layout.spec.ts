import { test, expect } from "@playwright/test";
test("assistant preserves failed submissions and uses one workspace tab", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const saved = localStorage.getItem("test-native-db");
    const record = (value: any) => ({
      value,
      revision: 1,
      updated_at: new Date().toISOString(),
    });
    let data: any = saved
      ? JSON.parse(saved)
      : Object.fromEntries(
          [
            "calendar",
            "label",
            "task",
            "occurrence",
            "document",
            "thread",
            "profile",
            "binding",
            "network",
            "changeset",
            "layout",
            "run",
            "artifact",
            "automation",
            "addon",
          ].map((k) => [k, []]),
        );
    if (!saved) {
      data.calendar = [
        record({ id: "cal", name: "Learning", timezone: "Asia/Qatar" }),
      ];
      data.profile = [
        record({
          id: "p1",
          name: "Fast model",
          provider: "gemini",
          model: "test-model",
          context_tokens: 8192,
        }),
        record({
          id: "p2",
          name: "Alternate model",
          provider: "openrouter",
          model: "test-model-2",
          context_tokens: 8192,
        }),
      ];
    }
    const persist = () =>
      localStorage.setItem("test-native-db", JSON.stringify(data));
    persist();
    (window as any).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: () => {},
    };
    (window as any).__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: "main" },
        currentWebview: { label: "main" },
      },
      transformCallback: () => 1,
      unregisterCallback: () => {},
      invoke: async (command: string, args: any) => {
        if (command !== "rpc") return 1;
        const { action, payload: p } = args;
        if (action === "next_snapshot") return structuredClone(data);
        if (action === "next_get")
          return structuredClone(
            data[p.kind].find((r: any) => r.value.id === p.id),
          );
        if (action === "next_save") {
          const old = data[p.kind].find((r: any) => r.value.id === p.value.id);
          if ((old?.revision || 0) !== p.revision)
            throw Error("Revision conflict");
          const next = {
            value: structuredClone(p.value),
            revision: p.revision + 1,
            updated_at: new Date().toISOString(),
          };
          data[p.kind] = data[p.kind]
            .filter((r: any) => r !== old)
            .concat(next);
          persist();
          return structuredClone(next);
        }
        if (action === "next_send") {
          const count = Number(localStorage.getItem("test-sends") || 0) + 1;
          localStorage.setItem("test-sends", String(count));
          await new Promise((r) => setTimeout(r, 600));
          if (count === 1) throw Error("Provider temporarily unavailable");
          const t = data.thread.find((r: any) => r.value.id === p.thread_id);
          t.value.messages.push(
            {
              id: "u" + count,
              role: "user",
              content: p.request,
              at: new Date().toISOString(),
            },
            {
              id: "a" + count,
              role: "assistant",
              content: "Here is your proposed plan.",
              proposal_id: "proposal",
              at: new Date().toISOString(),
            },
          );
          t.revision++;
          data.changeset = [
            record({
              id: "proposal",
              summary: "Three learning sessions",
              changes: [],
              accepted: false,
            }),
          ];
          persist();
          return structuredClone(t);
        }
        throw Error("Unimplemented test action " + action);
      },
    };
  });
  await page.goto("/");
  await page
    .getByRole("complementary", { name: "Workspace navigation" })
    .getByRole("button", { name: "Assistant", exact: true })
    .click();
  let chat = page.locator(".nx-assistant-session:visible");
  for (let i = 0; i < 3; i++)
    await chat
      .getByRole("button", { name: "New conversation", exact: true })
      .click();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("test-native-db")!).thread.length,
    ),
  ).toBe(0);
  expect(
    await page.getByRole("tab", { name: "Assistant", exact: true }).count(),
  ).toBe(1);
  await chat.getByRole("button", { name: "Destination", exact: true }).click();
  await expect(
    page.getByRole("menuitem", { name: "Create a new destination" }),
  ).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Learning", exact: true }).click();
  await chat
    .getByRole("button", { name: "Model profile", exact: true })
    .click();
  await page.getByRole("menuitemradio", { name: /Fast model/ }).click();
  await chat.getByLabel("Message", { exact: true }).fill("Plan tomorrow");
  await chat.getByRole("button", { name: "Send", exact: true }).click();
  await expect(chat.getByLabel("Pending message")).toContainText(
    "Plan tomorrow",
  );
  await expect(
    chat.getByRole("button", { name: "Stop", exact: true }),
  ).toBeVisible();
  await expect(chat.getByRole("alert")).toContainText(
    "Provider temporarily unavailable",
  );
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("test-native-db")!).thread.length,
    ),
  ).toBe(1);
  await page.reload();
  await page
    .getByRole("complementary", { name: "Workspace navigation" })
    .getByRole("button", { name: "Assistant", exact: true })
    .click();
  chat = page.locator(".nx-assistant-session:visible");
  await chat
    .locator(".nx-thread-list")
    .getByRole("button", { name: "Plan tomorrow", exact: true })
    .click();
  await expect(chat.getByLabel("Pending message")).toContainText(
    "Plan tomorrow",
  );
  await chat
    .getByRole("button", { name: "Model profile", exact: true })
    .click();
  await page.getByRole("menuitemradio", { name: /Alternate model/ }).click();
  await chat
    .getByRole("button", { name: "Resend message", exact: true })
    .click();
  await expect(
    chat.getByRole("button", { name: "Review plan", exact: true }),
  ).toBeVisible();
  await expect(chat.getByLabel("Pending message")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("test-sends"))).toBe(
    "2",
  );
  expect(
    await page.getByRole("tab", { name: "Assistant", exact: true }).count(),
  ).toBe(1);
  await chat
    .getByRole("button", { name: "Add files or choose a mode" })
    .click();
  await page
    .getByRole("menuitemradio", { name: "Plan mode", exact: true })
    .click();
  await chat
    .getByRole("button", { name: "Model profile", exact: true })
    .click();
  await page.screenshot({
    path: "../../docs/screenshots/next-chat-composer.png",
  });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 940, height: 680 });
  await chat
    .getByRole("button", { name: "Model profile", exact: true })
    .click();
  const popup = await page.getByRole("menu").boundingBox();
  expect(popup!.x).toBeGreaterThanOrEqual(0);
  expect(popup!.x + popup!.width).toBeLessThanOrEqual(940);
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: "../../docs/screenshots/next-chat-composer-narrow.png",
  });
  expect(errors).toEqual([]);
});
test("empty destination menu offers creation and Search has heading spacing", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("complementary", { name: "Workspace navigation" })
    .getByRole("button", { name: "Assistant", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Destination", exact: true }).locator(".lucide-calendar-days")).toHaveCount(0);
  await page.getByRole("button", { name: "Destination", exact: true }).click();
  await expect(
    page.getByRole("menuitem", { name: "Create a new destination" }),
  ).toBeVisible();
  await page
    .getByRole("menuitem", { name: "Create a new destination" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Create", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("complementary", { name: "Workspace navigation" })
    .getByRole("button", { name: "Search", exact: true })
    .click();
  const heading = await page
    .getByRole("heading", { name: "Search", exact: true })
    .boundingBox();
  const input = await page
    .getByLabel("Search all workspace content")
    .boundingBox();
  expect(input!.y - heading!.y - heading!.height).toBeGreaterThanOrEqual(18);
});
