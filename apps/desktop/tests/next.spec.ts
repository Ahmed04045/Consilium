import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) =>
    console.error("Browser exception:", error.message),
  );
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
  await page.getByLabel("Profile name").fill("Unsaved profile");
  await page.getByRole("tab", { name: "Learning" }).click();
  await page.getByRole("tab", { name: "Settings" }).click();
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
  await expect(
    page.getByText("Build & discuss network", { exact: true }),
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
