import { test, expect } from "@playwright/test";
test("phone sync is explicit, edits round-trip, conflicts preserve drafts", async ({
  page,
}) => {
  let requests = 0,
    revision = 1,
    authMode = "valid";
  let snapshot: any = {
    schema_version: 1,
    calendars: [{ id: "c", name: "Learning", timezone: "Asia/Qatar" }],
    labels: [],
    tasks: [],
    occurrences: [],
  };
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(
    "https://fnmcnuytkijnjpvznvow.supabase.co/**",
    async (route) => {
      requests++;
      const p = route.request().postDataJSON(),
        url = route.request().url();
      let value: any;
      if (
        url.includes("/auth/") &&
        url.includes("grant_type=password") &&
        authMode === "invalid"
      )
        return route.fulfill({
          status: 400,
          json: {
            code: 400,
            error_code: "invalid_credentials",
            msg: "Invalid login credentials",
          },
        });
      if (url.includes("/auth/") && url.includes("/signup"))
        return route.fulfill({
          json: { user: { id: "user-a", email: "demo@example.test" } },
        });
      if (url.includes("/auth/"))
        value = {
          access_token: "test",
          refresh_token: "refresh",
          expires_in: 3600,
          user: { id: "user-a" },
        };
      else if (url.endsWith("consilium_phone_read"))
        value = { revision, payload: snapshot };
      else {
        if (p.expected_revision !== revision)
          return route.fulfill({ status: 409, body: "{}" });
        snapshot = p.workspace;
        value = ++revision;
      }
      await route.fulfill({ json: value });
    },
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  expect(requests).toBe(0);
  await page.getByLabel("Email", { exact: true }).fill("demo@example.test");
  await page.getByLabel("Password", { exact: true }).fill("synthetic-password");
  authMode = "invalid";
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Email or password is incorrect.",
  );
  await expect(page.getByRole("button", { name: "Review sync" })).toHaveCount(
    0,
  );
  authMode = "signup";
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Account request submitted. Check your email to confirm, then sign in.",
  );
  await expect(page.getByRole("button", { name: "Review sync" })).toHaveCount(
    0,
  );
  authMode = "valid";
  await page.getByLabel("Password", { exact: true }).fill("synthetic-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Review sync" })).toBeVisible();
  await page.getByRole("button", { name: "Review sync" }).click();
  await expect(
    page.getByRole("button", { name: "Upload calendars" }),
  ).toBeDisabled();
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Download calendars" }).click();
  await expect(
    page.getByRole("combobox", { name: "Calendar", exact: true }),
  ).toHaveValue("c");
  await page.getByText("Add task", { exact: true }).first().click();
  await page.getByLabel("Title", { exact: true }).fill("Practice French");
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Practice French" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Complete", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Mark incomplete" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Review sync" }).click();
  await page.getByRole("button", { name: "Upload calendars" }).click();
  await expect(page.getByRole("status")).toHaveText("Done");
  expect(snapshot.tasks[0].completed).toBe(true);
  expect(revision).toBe(2);
  await page.getByRole("button", { name: "Review sync" }).click();
  revision++;
  await page.getByRole("button", { name: "Upload calendars" }).click();
  await expect(page.getByRole("alert")).toContainText("409");
  await expect(
    page.getByRole("heading", { name: "Practice French" }),
  ).toBeVisible();
  snapshot = { ...snapshot, tasks: [null] };
  await page.getByRole("button", { name: "Review sync" }).click();
  await expect(page.getByRole("alert")).toContainText("Invalid task record");
  await expect(
    page.getByRole("heading", { name: "Practice French" }),
  ).toBeVisible();
  await page.screenshot({ path: "../../docs/screenshots/phone-sync.png" });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Practice French" }),
  ).toBeHidden();
  await page.reload();
  await page.getByLabel("Email",{exact:true}).fill("demo@example.test");
  await page.getByLabel("Password",{exact:true}).fill("synthetic-password");
  await page.getByRole("button",{name:"Sign in",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Practice French"})).toBeVisible();
  expect(errors).toEqual([]);
});
