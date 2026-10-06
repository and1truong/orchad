import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, user: string) {
  await page.goto("/");
  await page.getByLabel("Account", { exact: true }).fill(user);
  await page.getByLabel("Password", { exact: true }).fill(user + "-dev");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
}
test("human reviewed recurring assignment, due job dedup, private notification, fresh learning and preserved certificate on cancel", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "admin");
  await page
    .getByRole("button", { name: "Administration", exact: true })
    .click();
  const user = page.getByRole("form", { name: "User editor", exact: true });
  await user.getByLabel("User ID", { exact: true }).fill("e2e-scheduled");
  await user.getByLabel("User name", { exact: true }).fill("Scheduled learner");
  await user.getByRole("button", { name: "Save user", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Scheduled learner", exact: true }),
  ).toBeVisible();
  const editor = page.getByRole("form", {
    name: "Assignment plan editor",
    exact: true,
  });
  await editor.getByLabel("Plan ID", { exact: true }).fill("e2e-schedule");
  await editor
    .getByLabel("Assignment title", { exact: true })
    .fill("Scheduled practice workflow");
  await editor
    .getByLabel("Assignment learner IDs · one per line", { exact: true })
    .fill("e2e-scheduled");
  const past = new Date(Date.now() - 60000);
  const local = new Date(past.getTime() - past.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  await editor
    .getByLabel("Starts · your local time", { exact: true })
    .fill(local);
  await editor
    .getByLabel("Repeat every UTC days · 0 for once", { exact: true })
    .fill("1");
  await editor
    .getByRole("combobox", { name: "Deadline type", exact: true })
    .selectOption("rolling");
  await editor.getByLabel("Days after delivery", { exact: true }).fill("3");
  await editor
    .getByLabel("Assignment change reason", { exact: true })
    .fill("Reviewed synthetic audience and rules");
  await expect(
    editor.getByRole("button", {
      name: "Save reviewed assignment plan",
      exact: true,
    }),
  ).toBeDisabled();
  await editor
    .getByRole("button", { name: "Preview assignment audience", exact: true })
    .click();
  await expect(editor).toContainText("1 authorized active recipients");
  await editor
    .getByRole("button", { name: "Save reviewed assignment plan", exact: true })
    .click();
  const operations = page.getByRole("region", {
    name: "Assignment operations",
    exact: true,
  });
  const row = operations
    .locator("section.panel")
    .filter({
      has: page.getByRole("heading", {
        name: "Scheduled practice workflow",
        exact: true,
      }),
    });
  await expect(row).toContainText("0 cycles");
  await page
    .getByRole("button", { name: "Run due assignment jobs", exact: true })
    .click();
  await expect(row).toContainText("1 cycles");
  await expect(operations.getByRole("status")).toContainText("1 due cycles");
  await page
    .getByRole("button", { name: "Run due assignment jobs", exact: true })
    .click();
  await expect(operations.getByRole("status")).toContainText("0 due cycles");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, "e2e-scheduled");
  await page
    .getByRole("button", { name: "Notifications", exact: true })
    .click();
  await expect(
    operations.getByRole("heading", {
      name: "Scheduled practice workflow",
      exact: true,
    }),
  ).toHaveCount(1);
  await operations
    .getByRole("button", { name: "Mark notification read", exact: true })
    .click();
  await expect(operations).toContainText("Read");
  await page.getByRole("button", { name: "My learning", exact: true }).click();
  await expect(page.locator(".learning-row")).toContainText("Scheduled cycle");
  await page
    .getByRole("button", { name: "Continue learning", exact: true })
    .click();
  await page
    .getByRole("button", { name: "I have studied this lesson", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Lesson acknowledged ✓" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Protect capacity", exact: true })
    .click();
  await page
    .getByRole("button", { name: "I have studied this lesson", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Lesson acknowledged ✓" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Start assessment", exact: true })
    .click();
  await page
    .getByLabel("A retry budget, jitter and deadline", { exact: true })
    .check();
  await expect(
    page.getByLabel("Reconcile the original operation key", { exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel("Reconcile the original operation key", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "Confirm and submit my answers", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Score: 100%");
  await page
    .getByRole("button", { name: "Notifications", exact: true })
    .click();
  await expect(
    operations.getByRole("heading", {
      name: "Scheduled practice workflow completed",
      exact: true,
    }),
  ).toHaveCount(1);
  await page.reload();
  await page
    .getByRole("button", { name: "Notifications", exact: true })
    .click();
  await expect(
    operations.getByRole("heading", {
      name: "Scheduled practice workflow completed",
      exact: true,
    }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, "admin");
  await page
    .getByRole("button", { name: "Administration", exact: true })
    .click();
  await row
    .getByRole("combobox", { name: "Plan action", exact: true })
    .selectOption("cancelled");
  await row
    .getByLabel("Plan action reason", { exact: true })
    .fill("End synthetic recurring requirement");
  await row
    .getByRole("button", { name: "Apply plan action", exact: true })
    .click();
  await expect(row).toContainText("cancelled");
  await expect(
    row.getByRole("button", { name: "Edit future rules", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, "e2e-scheduled");
  await page.getByRole("button", { name: "My learning", exact: true }).click();
  await page.getByRole("button", { name: "Certificate", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Completion certificate", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/recurring-assignment-mobile.png",
    fullPage: true,
  });
});
