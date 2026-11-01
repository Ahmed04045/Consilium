import { test, expect } from "@playwright/test";
test("settings groups related tools and retains context drafts", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("heading", { name: "Home", exact: true }).waitFor();
  await page.keyboard.press("Control+,");
  const nav = page.getByRole("complementary", { name: "Settings navigation" });
  await expect(nav.locator("nav button")).toHaveCount(6);
  await nav
    .getByRole("button", { name: "Profile & context", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Profile", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Personal context", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Phone connection", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Personal context", { exact: true })
    .fill("I prefer short learning sessions.");
  await nav
    .getByRole("button", { name: "Files & backups", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Connected files & folders",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Backups & recovery", exact: true }),
  ).toBeVisible();
  await nav
    .getByRole("button", { name: "Profile & context", exact: true })
    .click();
  await expect(
    page.getByLabel("Personal context", { exact: true }),
  ).toHaveValue("I prefer short learning sessions.");
  await page.getByRole("button", { name: "Save context", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Context saved" }),
  ).toBeVisible();
  await page.getByLabel("Find a setting").fill("phone sync");
  await expect(nav.locator("nav button")).toHaveCount(1);
  await expect(
    nav.getByRole("button", { name: "Profile & context", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Find a setting").fill("");
  await page.screenshot({
    path: "../../docs/screenshots/next-settings-personal.png",
  });
  await page.setViewportSize({ width: 940, height: 640 });
  await nav
    .getByRole("button", { name: "Files & backups", exact: true })
    .click();
  expect(
    await page
      .locator(".nx-settings-content")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: "../../docs/screenshots/next-settings-data.png",
  });
});
test("account loading is explicit and connection verification is user initiated", async ({
  page,
}) => {
  await page.addInitScript(() => {
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
        const { action } = args;
        if (action === "next_snapshot")
          return Object.fromEntries(
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
        if (action === "next_phone_status") {
          await new Promise((r) => setTimeout(r, 400));
          return {
            configured: true,
            connected: true,
            email: "demo@example.test",
          };
        }
        if (action === "next_phone_verify") {
          localStorage.setItem(
            "verify-count",
            String(Number(localStorage.getItem("verify-count") || "0") + 1),
          );
          return { message: "Connection verified" };
        }
        if (action === "named_keys") return { keys: [] };
        if (action === "next_addon_samples") return [];
        throw Error("Unexpected action " + action);
      },
    };
  });
  await page.goto("/");
  await page.getByRole("heading", { name: "Home", exact: true }).waitFor();
  await page.keyboard.press("Control+,");
  await page
    .getByRole("complementary", { name: "Settings navigation" })
    .getByRole("button", { name: "Profile & context", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Loading account…" }),
  ).toBeVisible();
  await expect(
    page.getByText("Connection is not configured in this build."),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Check connection", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("verify-count")),
  ).toBeNull();
  await page
    .getByRole("button", { name: "Check connection", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Connection verified" }),
  ).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("verify-count"))).toBe(
    "1",
  );
});

test("appearance density and completed-task defaults affect new workspaces", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("heading", { name: "Home", exact: true }).waitFor();
  await page.keyboard.press("Control+,");
  await page.getByRole("combobox", { name: "Density", exact: true }).selectOption("compact");
  await page
    .getByRole("checkbox", {
      name: "Show completed tasks in new calendar views",
    })
    .uncheck();
  await page.getByRole("button", { name: "Back to app" }).click();
  const nav = page.getByRole("complementary", { name: "Workspace navigation" });
  expect(
    (await nav
      .getByRole("button", { name: "Home", exact: true })
      .boundingBox())!.height,
  ).toBeLessThanOrEqual(34);
  await nav.getByRole("button", { name: "Create", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Create", exact: true });
  await dialog.getByRole("button", { name: "Calendar", exact: true }).click();
  await dialog.getByLabel("Name", { exact: true }).fill("Test calendar");
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Completed off", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
});
