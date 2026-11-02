import { test, expect, type Page } from "@playwright/test";
async function seed(page: Page) {
  await page.addInitScript(() => {
    const row = (value: any) => ({
      value,
      revision: 1,
      updated_at: new Date().toISOString(),
    });
    const now = new Date();
    const saturday = new Date(now.getFullYear(), now.getMonth(), 1);
    saturday.setDate(1 + ((6 - saturday.getDay() + 7) % 7));
    const day = `${saturday.getFullYear()}-${String(saturday.getMonth() + 1).padStart(2, "0")}-${String(saturday.getDate()).padStart(2, "0")}`;
    if (!localStorage.getItem("consilium-next-browser"))
      localStorage.setItem(
        "consilium-next-browser",
        JSON.stringify({
          calendar: [
            row({ id: "c1", name: "Learning", timezone: "UTC" }),
            row({ id: "c2", name: "Personal", timezone: "UTC" }),
          ],
          task: [
            row({
              id: "saturday",
              calendar_id: "c1",
              title: "Review vocabulary",
              kind: "flexible",
              start_date: day,
              end_date: day,
              start_time: "",
              end_time: "",
              timezone: "UTC",
              label_id: null,
              parent_id: null,
              color: "green",
              description: "Review this week’s learning",
              completed: false,
              steps: [],
              target: null,
              progress: 0,
              unit: "",
              recurrence: null,
              deleted: false,
            }),
          ],
          network: [
            row({
              id: "n",
              schema_version: 1,
              name: "Study workflow",
              nodes: [],
              edges: [],
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
}
async function draw(page: Page, x = 0.2, y = 0.25, dx = 0.18, dy = 0.12) {
  const svg = page.locator(".nx-ink-layer:visible");
  const box = (await svg.boundingBox())!;
  await page.mouse.move(box.x + box.width * x, box.y + box.height * y);
  await page.mouse.down();
  for (let i = 1; i <= 14; i++)
    await page.mouse.move(
      box.x + box.width * (x + (dx * i) / 14),
      box.y + box.height * (y + (dy * i) / 14),
    );
  await page.mouse.up();
}
const nav = (page: Page) =>
  page.getByRole("complementary", { name: "Workspace navigation" });
test("calendar ink, blocks and undo persist per period and calendar", async ({
  page,
}) => {
  await seed(page);
  await nav(page)
    .getByRole("button", { name: "Learning", exact: true })
    .click();
  await page
    .locator(".nx-calendar:visible")
    .getByLabel("Calendar view", { exact: true })
    .selectOption("Month");
  await page.getByRole("button", { name: "Draw on calendar" }).click();
  await expect(
    page.getByRole("toolbar", { name: "Drawing tools" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Drawing actions", exact: true })
    .click();
  await expect(
    page.getByRole("menu", { name: "Drawing actions" }),
  ).toBeVisible();
  await draw(page);
  await expect(page.getByRole("menu", { name: "Drawing actions" })).toHaveCount(
    0,
  );
  await expect(
    page.locator(".nx-ink-layer:visible [data-tool=pen]"),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Highlight block", exact: true })
    .click();
  await page.getByLabel("Ink color", { exact: true }).fill("#f5c66f");
  await draw(page, 0.45, 0.3, 0.23, 0.2);
  await expect(
    page.locator(".nx-ink-layer:visible rect[data-tool=highlight]"),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Undo drawing", exact: true }).click();
  await expect(
    page.locator(".nx-ink-layer:visible rect[data-tool=highlight]"),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Redo drawing", exact: true }).click();
  await expect(
    page.locator(".nx-ink-layer:visible rect[data-tool=highlight]"),
  ).toHaveCount(1);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("consilium-next-browser")!)
            .annotation?.[0]?.value.marks.length,
      ),
    )
    .toBe(2);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Next period", exact: true }).click();
  await expect(
    page.locator(".nx-ink-layer:visible [data-mark-id]"),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Previous period", exact: true })
    .click();
  await expect(
    page.locator(".nx-ink-layer:visible [data-mark-id]"),
  ).toHaveCount(2);
  await page.screenshot({ path: "../../docs/screenshots/calendar-ink.png" });
  await nav(page)
    .getByRole("button", { name: "Personal", exact: true })
    .click();
  await page
    .locator(".nx-calendar:visible")
    .getByLabel("Calendar view", { exact: true })
    .selectOption("Month");
  await expect(
    page.locator(".nx-ink-layer:visible [data-mark-id]"),
  ).toHaveCount(0);
  await page.reload();
  await nav(page)
    .getByRole("button", { name: "Learning", exact: true })
    .click();
  await page
    .locator(".nx-calendar:visible")
    .getByLabel("Calendar view", { exact: true })
    .selectOption("Month");
  await expect(
    page.locator(".nx-ink-layer:visible [data-mark-id]"),
  ).toHaveCount(2);
  await page.setViewportSize({ width: 940, height: 640 });
  await expect(
    page.locator(".nx-ink-layer:visible [data-mark-id]"),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Draw on calendar" }).click();
  await expect(
    page.getByRole("toolbar", { name: "Drawing tools" }),
  ).toBeVisible();
  expect(
    await page
      .locator(".nx-calendar")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  expect(
    await page
      .locator(".nx-tabpage:not([hidden])")
      .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  const lastColumn = page.locator(".nx-month-grid:visible > .nx-day").nth(6);
  await expect(lastColumn).toHaveCSS("border-right-width", "0px");
  await expect(lastColumn.locator(".nx-task-preview")).toHaveCSS(
    "right",
    "0px",
  );
});
test("network drawings stay in world coordinates and never edit executable graphs", async ({
  page,
}) => {
  await seed(page);
  await nav(page)
    .getByRole("button", { name: "Study workflow", exact: true })
    .click();
  await page.getByRole("button", { name: "Draw on network" }).click();
  await draw(page, 0.15, 0.3, 0.24, 0.2);
  const path = page.locator(".nx-ink-layer:visible path[data-tool=pen]");
  await expect(path).toHaveCount(1);
  const d = await path.getAttribute("d"),
    transform = await page
      .locator(".nx-ink-layer:visible > g")
      .getAttribute("transform");
  await page.getByRole("button", { name: "Navigate", exact: true }).click();
  await page.getByRole("button", { name: /zoom in/i }).click();
  await expect(page.locator(".nx-ink-layer:visible > g")).not.toHaveAttribute(
    "transform",
    transform!,
  );
  await expect(path).toHaveAttribute("d", d!);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("consilium-next-browser")!).network[0]
          .revision,
    ),
  ).toBe(1);
  await page.getByRole("button", { name: "Eraser", exact: true }).click();
  // Erasing under a zoomed camera uses screen-space hit testing.
  const mark = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("consilium-next-browser")!).annotation[0]
        .value.marks[0],
  );
  const viewport = await page
    .locator(".nx-ink-layer:visible > g")
    .getAttribute("transform");
  const numbers = viewport!.match(/-?[\d.]+/g)!.map(Number);
  const box = (await page.locator(".nx-ink-layer:visible").boundingBox())!;
  await page.mouse.click(
    box.x + numbers[0] + mark.points[4][0] * numbers[2],
    box.y + numbers[1] + mark.points[4][1] * numbers[2],
  );
  await expect(path).toHaveCount(0);
  await page.getByRole("button", { name: "Undo drawing", exact: true }).click();
  await expect(path).toHaveCount(1);
  await page.screenshot({ path: "../../docs/screenshots/network-ink.png" });
  await page.reload();
  await nav(page)
    .getByRole("button", { name: "Study workflow", exact: true })
    .click();
  await expect(
    page.locator(".nx-ink-layer:visible path[data-tool=pen]"),
  ).toHaveCount(1);
  await page.setViewportSize({ width: 940, height: 640 });
  await page.getByRole("button", { name: "Draw on network" }).click();
  const toolbarBox = (await page
    .getByRole("toolbar", { name: "Drawing tools" })
    .boundingBox())!;
  const narrowCanvas = (await page
    .locator(".nx-ink-layer:visible")
    .boundingBox())!;
  expect(toolbarBox.x).toBeGreaterThanOrEqual(narrowCanvas.x);
  expect(toolbarBox.x + toolbarBox.width).toBeLessThanOrEqual(
    narrowCanvas.x + narrowCanvas.width + 1,
  );
});
test("stale saves preserve the drawing and offer explicit recovery", async ({
  page,
}) => {
  await seed(page);
  await nav(page)
    .getByRole("button", { name: "Learning", exact: true })
    .click();
  await page
    .locator(".nx-calendar:visible")
    .getByLabel("Calendar view", { exact: true })
    .selectOption("Month");
  await page.getByRole("button", { name: "Draw on calendar" }).click();
  await draw(page);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("consilium-next-browser")!)
            .annotation?.[0]?.revision,
      ),
    )
    .toBe(1);
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("consilium-next-browser")!);
    data.annotation[0].revision = 2;
    localStorage.setItem("consilium-next-browser", JSON.stringify(data));
  });
  await draw(page, 0.55, 0.3, 0.15, 0.2);
  await expect(page.getByRole("alert")).toContainText("Drawing not saved");
  await expect(
    page.locator(".nx-ink-layer:visible [data-tool=pen]"),
  ).toHaveCount(2);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("consilium-next-browser")!)
          .annotation[0].value.marks.length,
    ),
  ).toBe(1);
  await page.reload();
  await nav(page)
    .getByRole("button", { name: "Learning", exact: true })
    .click();
  await page
    .locator(".nx-calendar:visible")
    .getByLabel("Calendar view", { exact: true })
    .selectOption("Month");
  await expect(page.getByRole("alert")).toContainText("recovery draft");
  await expect(
    page.locator(".nx-ink-layer:visible [data-tool=pen]"),
  ).toHaveCount(2);
  await page
    .getByRole("button", { name: "Load saved drawing", exact: true })
    .click();
  await expect(
    page.locator(".nx-ink-layer:visible [data-tool=pen]"),
  ).toHaveCount(1);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("hourly drawings exclude time labels and cancelled gestures leave no marks", async ({
  page,
}) => {
  await seed(page);
  await nav(page)
    .getByRole("button", { name: "Learning", exact: true })
    .click();
  const view = page
    .locator(".nx-calendar:visible")
    .getByLabel("Calendar view", { exact: true });
  await view.selectOption("Week");
  await page.getByRole("button", { name: "Draw on calendar" }).click();
  const svg = page.locator(".nx-ink-layer:visible");
  const canvas = (await svg.boundingBox())!;
  const body = (await page.locator(".nx-hour-body:visible").boundingBox())!;
  expect(canvas.x - body.x).toBeCloseTo(55, 0);
  await page.mouse.move(canvas.x + 100, canvas.y + 90);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 160, canvas.y + 130);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(svg.locator("[data-mark-id]")).toHaveCount(0);
  await page.getByRole("button", { name: "Draw on calendar" }).click();
  await draw(page, 0.2, 0.04, 0.2, 0.03);
  await expect(svg.locator("[data-mark-id]")).toHaveCount(1);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("consilium-next-browser")!).annotation
            ?.length,
      ),
    )
    .toBe(1);
  await view.selectOption("Day");
  await expect(svg.locator("[data-mark-id]")).toHaveCount(0);
  await view.selectOption("Week");
  await expect(svg.locator("[data-mark-id]")).toHaveCount(1);
  await expect(
    page.getByRole("toolbar", { name: "Drawing tools" }),
  ).toBeInViewport();
  await page.setViewportSize({ width: 940, height: 640 });
  const width = await page
    .locator(".nx-hour-body:visible")
    .evaluate((el) => el.clientWidth);
  expect(width).toBeGreaterThanOrEqual(895);
  const surface = (await svg.boundingBox())!;
  const columns = await page.locator(".nx-hour-column:visible").all();
  const last = (await columns.at(-1)!.boundingBox())!;
  expect(surface.x + surface.width).toBeCloseTo(last.x + last.width, 0);
});
