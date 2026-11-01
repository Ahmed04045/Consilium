import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) =>
    console.error("Browser exception:", error.message),
  );
});
test("Home prioritizes recent work and navigation groups retain their state", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const row = (value: any, updated_at: string) => ({
      value,
      revision: 1,
      updated_at,
    });
    localStorage.setItem(
      "consilium-next-browser",
      JSON.stringify({
        calendar: [
          row(
            {
              id: "design-calendar",
              name: "Language learning",
              timezone: "Asia/Qatar",
            },
            "2026-10-24T10:00:00Z",
          ),
        ],
        network: [
          row(
            {
              id: "design-network",
              schema_version: 1,
              name: "Reading workflow",
              nodes: [],
              edges: [],
            },
            "2026-10-25T10:00:00Z",
          ),
        ],
        document: [
          row(
            {
              id: "design-document",
              title: "Study guide",
              text: "Practice, recall and review.",
            },
            "2026-10-25T11:00:00Z",
          ),
        ],
        thread: [
          row(
            {
              id: "design-thread",
              title: "Plan the next week",
              scope: "calendar:design-calendar",
              mode: "schedule_chat",
              profile_id: "",
              messages: [],
            },
            "2026-10-26T10:00:00Z",
          ),
        ],
      }),
    );
  });
  await page.goto("/");
  await expect(page.locator(".nx-recent-card strong").first()).toHaveText(
    "Plan the next week",
  );
  const nav = page.getByRole("complementary", { name: "Workspace navigation" });
  await expect(
    nav.getByRole("button", { name: "Home", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  const group = nav.getByRole("button", { name: /^Calendars/ });
  await group.focus();
  await page.keyboard.press("Enter");
  await expect(group).toHaveAttribute("aria-expanded", "false");
  await expect(
    nav.getByRole("button", { name: "Language learning", exact: true }),
  ).toBeHidden();
  await page.reload();
  await expect(group).toHaveAttribute("aria-expanded", "false");
  await group.click();
  await nav
    .getByRole("button", { name: "Language learning", exact: true })
    .click();
  await expect(
    nav.getByRole("button", { name: "Language learning", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await nav.getByRole("button", { name: "Home", exact: true }).click();
  await page
    .getByRole("button", { name: "Pin Study guide", exact: true })
    .click();
  await expect(page.locator(".nx-pins")).toContainText("Study guide");
  expect(
    await page
      .locator(".nx-home")
      .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
  ).toBeTruthy();
  await page.screenshot({
    path: "../../docs/screenshots/next-home-design.png",
  });
});
test("Home is empty, tabs retain drafts, and calendar creation has an explicit destination", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.keyboard.press("Control+n");
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Learning");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Learning" })).toBeVisible();
  await page.getByRole("button", { name: "Create in Learning" }).click();
  await expect(
    page.getByLabel("Destination calendar", { exact: true }),
  ).toHaveValue(/.+/);
  await page.getByLabel("Task title").fill("Read two chapters");
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  await expect(
    page.locator(".nx-event-title").filter({ hasText: "Read two chapters" }),
  ).toBeVisible();
  await page
    .locator(".nx-event-title")
    .filter({ hasText: "Read two chapters" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Read two chapters" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Settings", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "AI models", exact: true }).click();
  await page.getByLabel("Profile name").fill("Unsaved profile");
  await page.getByRole("button", { name: "Back to app" }).click();
  await page.getByRole("tab", { name: "Learning" }).click();
  await page.keyboard.press("Control+,");
  await page.getByRole("button", { name: "AI models", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Settings" })).toHaveCount(0);
  await expect(page.getByLabel("Profile name")).toHaveValue("Unsaved profile");
});
test("top bar searches directly and labels do not overlap between calendars", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const now = new Date().toISOString();
    const r = (value: any) => ({ value, revision: 1, updated_at: now });
    const data = Object.fromEntries(
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
      ].map((k) => [k, []]),
    ) as Record<string, any[]>;
    data.calendar = [
      r({ id: "a", name: "Work", timezone: "Asia/Qatar" }),
      r({ id: "b", name: "Learning", timezone: "Asia/Qatar" }),
    ];
    data.label = [
      r({
        id: "la",
        name: "Private work label",
        color: "blue",
        calendar_id: "a",
      }),
      r({ id: "lb", name: "Study", color: "green", calendar_id: "b" }),
    ];
    localStorage.setItem("consilium-next-browser", JSON.stringify(data));
  });
  await page.goto("/");
  await page
    .locator(".nx-sidebar")
    .getByRole("button", { name: "Learning", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Study", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Private work label" }),
  ).toHaveCount(0);
  await page.getByLabel("Search workspace", { exact: true }).fill("Work");
  await expect(page.locator(".nx-search-results")).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Search", exact: true }),
  ).toHaveCount(0);
  await page
    .locator(".nx-search-results")
    .getByRole("button", { name: "Work calendar", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Work", exact: true }),
  ).toBeVisible();
});
test("task dialog has no horizontal overflow and Home widgets are keyboard resizable", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Customize", exact: true }).click();
  const width = page.getByRole("slider", { name: "Width" }).first();
  await width.focus();
  await page.keyboard.press("ArrowRight");
  await expect(width).toHaveValue("3");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.keyboard.press("Control+n");
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Personal");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Create in Personal" }).click();
  const dialog = page.getByRole("dialog", { name: "New task" });
  expect(
    await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
  ).toBeTruthy();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("network canvas measures nodes, searches, groups and retains edits", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Control+n");
  await page.getByRole("button", { name: "Network", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Graph checks");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .locator(".nx-palette")
    .getByRole("button", { name: "Input", exact: true })
    .click();
  await expect(page.locator(".nx-graph-node")).toHaveCount(0);
  await page.getByRole("button", { name: "Place in canvas centre" }).click();
  await expect(page.locator(".nx-graph-node")).toBeVisible();
  await page.getByLabel("Title", { exact: true }).fill("Reading input");
  await page.getByLabel("Search this network").fill("Reading");
  await page
    .locator(".nx-actions")
    .getByRole("button", { name: "Reading input", exact: true })
    .click();
  await page.getByText(/Group selected nodes/).click();
  await page.getByLabel("Group name").fill("Reading stage");
  await page.getByRole("button", { name: "Apply group", exact: true }).click();
  await expect(page.locator(".nx-graph-node")).toContainText("Reading stage");
  await page.waitForTimeout(400); // Allow the local recovery draft to persist.
  await page.getByRole("tab", { name: "Home", exact: true }).click();
  await page.getByRole("tab", { name: "Graph checks", exact: true }).click();
  await expect(page.locator(".nx-graph-node")).toContainText("Reading input");
});

test("library drag placement, visible pins and process properties work without JSON", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Control+n");
  await page.getByRole("button", { name: "Network", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Drag workflow");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const palette = page.locator(".nx-palette"),
    canvas = page.locator(".nx-canvas");
  await palette
    .getByRole("button", { name: "Input", exact: true })
    .dragTo(canvas, { targetPosition: { x: 45, y: 100 } });
  await palette
    .getByRole("button", { name: "Output", exact: true })
    .dragTo(canvas, { targetPosition: { x: 280, y: 170 } });
  await expect(page.locator(".nx-icon-node")).toHaveCount(2);
  const source = page.getByLabel("Input output", { exact: true }),
    target = page.getByLabel("Output input", { exact: true });
  expect((await source.boundingBox())!.width).toBeGreaterThanOrEqual(16);
  await page.screenshot({
    path: "../../docs/screenshots/next-editor-interactions.png",
  });
  await source.dragTo(target);
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  const inputNode = page
    .locator(".react-flow__node")
    .filter({ has: page.getByText("Input", { exact: true }).first() })
    .first();
  const before = await inputNode.getAttribute("style");
  const box = await inputNode.locator("strong").boundingBox();
  await page.mouse.move(box!.x + 15, box!.y + 5);
  await page.mouse.down();
  await page.mouse.move(box!.x + 55, box!.y + 45, { steps: 8 });
  await page.mouse.up();
  await expect(inputNode).not.toHaveAttribute("style", before!);
  await palette.getByRole("button", { name: "Process", exact: true }).click();
  await page.getByRole("button", { name: "Place in canvas centre" }).click();
  await page
    .getByLabel("Operation", { exact: true })
    .selectOption("select_fields");
  await page
    .getByLabel("Fields to keep", { exact: true })
    .fill("title, summary");
  await expect(page.getByLabel("Process fields", { exact: true })).toHaveValue(
    "title, summary",
  );
  await expect(
    page.getByLabel("Configuration JSON", { exact: true }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Design with AI" }).click();
  await page
    .getByRole("button", { name: "Add files or choose a mode" })
    .click();
  await page
    .getByRole("menuitem", { name: "Network options", exact: true })
    .click();
  await expect(
    page.getByLabel("Authoring stage", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Mode", { exact: true })).toHaveCount(0);
});

test("project save and export expose formats without invoking a picker until confirmed", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Control+n");
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Portable calendar");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Calendar actions", { exact: true }).click();
  await page.getByRole("button", { name: "Save…", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Save project" }),
  ).toBeVisible();
  await page.getByLabel("Format", { exact: true }).selectOption("folder");
  await expect(
    page.getByRole("button", { name: "Choose destination…" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Export…", exact: true }).click();
  await page.getByLabel("Format", { exact: true }).selectOption("algorithm");
  await expect(page.getByLabel("New folder name")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("without input values");
  await page.getByLabel("Format", { exact: true }).selectOption("file");
  await expect(
    page.getByRole("checkbox", { name: "Include selected input files" }),
  ).toBeChecked();
  const checkbox = await page
    .getByRole("checkbox", { name: "Include selected input files" })
    .boundingBox();
  expect(checkbox?.width).toBeLessThanOrEqual(24);
  expect(checkbox?.height).toBeLessThanOrEqual(24);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("new workflow nodes expose goal context, planner and adapter properties", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Control+n");
  await page.getByRole("button", { name: "Network", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Adaptive studio");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Goal & progress context", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Place in canvas centre", exact: true })
    .click();
  await expect(page.getByLabel("Past days", { exact: true })).toHaveValue("14");
  await expect(
    page.getByRole("checkbox", {
      name: "Include up to five document excerpts",
    }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Planner / decomposition", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Place in canvas centre", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Include goal context" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Program add-on", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Place in canvas centre", exact: true })
    .click();
  await expect(
    page.getByLabel("Installed add-on", { exact: true }),
  ).toBeVisible();
});

test("Settings screen, background contrast, menus and close controls", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Control+p");
  await expect(
    page.getByRole("tab", { name: "Assistant", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Control+,");
  await expect(page.getByRole("button", { name: "Back to app" })).toBeVisible();
  await expect(page.locator(".nx-body")).toBeHidden();
  await page.getByLabel("Background color", { exact: true }).fill("#f0f0f0");
  await expect(page.locator(".next-app")).toHaveCSS("color", "rgb(17, 17, 17)");
  await expect(page.locator(".next-app")).toHaveCSS(
    "background-color",
    "rgb(240, 240, 240)",
  );
  await expect(page.getByRole("button", { name: "Back to app" })).toHaveCSS(
    "color",
    "rgb(17, 17, 17)",
  );
  await page.screenshot({
    path: "../../docs/screenshots/next-settings-light.png",
  });
  await page.getByLabel("Background color", { exact: true }).fill("#171717");
  await expect(page.locator(".next-app")).toHaveCSS(
    "color",
    "rgb(255, 255, 255)",
  );
  await expect(page.getByRole("button", { name: "Back to app" })).toHaveCSS(
    "color",
    "rgb(255, 255, 255)",
  );
  await page.setViewportSize({ width: 940, height: 640 });
  expect(
    await page
      .locator(".nx-settings-screen")
      .evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBeTruthy();
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.screenshot({
    path: "../../docs/screenshots/next-settings-dark.png",
  });
  await page.getByRole("button", { name: "Back to app" }).click();
  const close = page.getByRole("button", {
    name: "Close Assistant",
    exact: true,
  });
  await page.getByRole("tab", { name: "Home", exact: true }).hover();
  await expect(close).toHaveCSS("opacity", "0");
  await page.getByRole("tab", { name: "Assistant", exact: true }).hover();
  await expect(close).toHaveCSS("opacity", "1");
  await close.hover();
  await expect(close).toHaveCSS("opacity", "1");
  await page
    .locator("summary")
    .filter({ hasText: /^View$/ })
    .click();
  await page.getByRole("menuitem", { name: "Zoom in" }).click();
  await expect(page.locator(".nx-body")).toHaveCSS("zoom", "1.1");
  await page.keyboard.press("Control+0");
  await expect(page.locator(".nx-body")).toHaveCSS("zoom", "1");
  await page
    .locator("summary")
    .filter({ hasText: /^Help$/ })
    .click();
  await page.getByRole("menuitem", { name: "Keyboard shortcuts" }).click();
  await expect(
    page.getByRole("heading", { name: "Keyboard shortcuts" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to app" }).click();
  await page.getByLabel("Search workspace", { exact: true }).fill("example");
  await page
    .locator("summary")
    .filter({ hasText: /^Edit$/ })
    .click();
  await page
    .getByRole("menuitem", { name: "Select all", exact: false })
    .click();
  expect(
    await page
      .getByLabel("Search workspace", { exact: true })
      .evaluate(
        (el: HTMLInputElement) => el.selectionEnd! - el.selectionStart!,
      ),
  ).toBe(7);
  await page.keyboard.press("Backspace");
  await page
    .locator("summary")
    .filter({ hasText: /^Edit$/ })
    .click();
  await page.screenshot({ path: "../../docs/screenshots/next-edit-menu.png" });
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator(".next-app")).toHaveCSS(
    "background-color",
    "rgb(23, 23, 23)",
  );
});
test("workspace actions delete a calendar and chats retain their sidebar", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const r = (value: any) => ({
      value,
      revision: 1,
      updated_at: "2026-10-27T10:00:00Z",
    });
    localStorage.setItem(
      "consilium-next-browser",
      JSON.stringify({
        calendar: [
          r({ id: "demo", name: "Demo calendar", timezone: "Asia/Qatar" }),
        ],
        thread: [
          r({
            id: "chat1",
            title: "First conversation",
            scope: "calendar:demo",
            mode: "schedule_chat",
            profile_id: "",
            messages: [],
          }),
          r({
            id: "chat2",
            title: "Second conversation",
            scope: "calendar:demo",
            mode: "schedule_chat",
            profile_id: "",
            messages: [],
          }),
        ],
      }),
    );
  });
  await page.goto("/");
  const nav = page.getByRole("complementary", { name: "Workspace navigation" });
  await expect(nav.getByText("Recent conversations")).toHaveCount(0);
  await nav.getByRole("button", { name: "Assistant", exact: true }).click();
  await page
    .locator(".nx-thread-list:visible")
    .getByRole("button", { name: "First conversation", exact: false })
    .first()
    .click();
  await expect(
    page.locator(".nx-tabpage:not([hidden]) .nx-thread-list:visible"),
  ).toBeVisible();
  await page
    .locator(".nx-tabpage:not([hidden]) .nx-thread-list:visible")
    .getByRole("button", { name: "Second conversation", exact: false })
    .first()
    .click();
  await expect(
    page.locator(".nx-tabpage:not([hidden]) .nx-thread-list:visible"),
  ).toBeVisible();
  await nav.getByRole("button", { name: "Demo calendar", exact: true }).click();
  await page.getByLabel("Calendar actions", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save as…", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("heading", { name: "Demo calendar", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save as…", exact: true }),
  ).toBeHidden();
  await expect(
    page.getByText("Local draft · choose Save to keep a project file"),
  ).toHaveCount(0);
  await nav
    .getByRole("button", { name: "Demo calendar", exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete…", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Delete item" })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(
    nav.getByRole("button", { name: "Demo calendar", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("tab", { name: "Demo calendar", exact: true }),
  ).toHaveCount(0);
});
test("network inspector separates input files from expected outputs", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const r = (value: any) => ({
      value,
      revision: 1,
      updated_at: "2026-10-27T10:00:00Z",
    });
    localStorage.setItem(
      "consilium-next-browser",
      JSON.stringify({
        binding: [
          r({
            id: "in",
            name: "reading.json",
            kind: "file",
            path: "C:/Demo/reading.json",
            writable: false,
          }),
          r({
            id: "out",
            name: "study-summary.json",
            kind: "file",
            path: "C:/Demo/study-summary.json",
            writable: true,
          }),
        ],
        network: [
          r({
            id: "demo-net",
            schema_version: 1,
            name: "Study guide",
            nodes: [
              {
                id: "read",
                kind: "file_read",
                title: "Read learning facts",
                position: { x: 100, y: 150 },
                config: { binding_id: "in", format: "json" },
              },
              {
                id: "write",
                kind: "file_write",
                title: "Save study guide",
                position: { x: 420, y: 150 },
                config: { binding_id: "out" },
              },
            ],
            edges: [
              {
                id: "edge",
                source: "read",
                target: "write",
                source_port: "out",
                target_port: "in",
              },
            ],
            limits: {
              concurrency: 2,
              iterations: 5,
              model_calls: 20,
              timeout_seconds: 1800,
            },
          }),
        ],
      }),
    );
  });
  await page.goto("/");
  await page
    .locator(".nx-sidebar")
    .getByRole("button", { name: "Study guide", exact: true })
    .click();
  await expect(page.locator(".nx-network-files")).toContainText(
    "Input · stays local until used",
  );
  await expect(page.locator(".nx-network-files")).toContainText(
    "Expected output",
  );
  await expect(
    page
      .locator(".nx-network-files")
      .getByRole("button", { name: "Preview output" }),
  ).toBeVisible();
  await page.screenshot({
    path: "../../docs/screenshots/next-network-files.png",
  });
});
