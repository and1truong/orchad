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
test("human user lifecycle, custom dynamic group preview, CSV review and learner preferences", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await login(page, "admin");
  await page
    .getByRole("button", { name: "Administration", exact: true })
    .click();
  const people = page.getByRole("region", {
    name: "People and groups",
    exact: true,
  });
  const user = people.getByRole("form", { name: "User editor", exact: true });
  await user.getByLabel("User ID", { exact: true }).fill("e2e-person");
  await user.getByLabel("User name", { exact: true }).fill("Original learner");
  await user
    .getByLabel("Manager ID · optional", { exact: true })
    .fill("manager");
  await user
    .getByRole("button", { name: "Add custom field", exact: true })
    .click();
  await user.getByLabel("Field name", { exact: true }).fill("team");
  await user.getByLabel("Field value", { exact: true }).fill("blue");
  await user.getByRole("button", { name: "Save user", exact: true }).click();
  await expect(
    people.locator(".learning-row").filter({
      has: page.getByRole("heading", {
        name: "Original learner",
        exact: true,
      }),
    }),
  ).toBeVisible();
  const group = people.getByRole("form", { name: "Group editor", exact: true });
  await group.getByLabel("Group ID", { exact: true }).fill("e2e-team");
  await group.getByLabel("Group name", { exact: true }).fill("Blue team");
  await group
    .getByRole("combobox", { name: "Rule field", exact: true })
    .selectOption("customField");
  await group.getByLabel("Custom field name", { exact: true }).fill("team");
  await group.getByLabel("Rule value", { exact: true }).fill("blue");
  await expect(
    group.getByRole("button", { name: "Save reviewed group", exact: true }),
  ).toBeDisabled();
  await group
    .getByRole("button", { name: "Preview membership", exact: true })
    .click();
  await expect(group.getByRole("status")).toContainText("1 active members");
  await expect(group.getByRole("status")).toBeVisible();
  await group
    .getByRole("button", { name: "Save reviewed group", exact: true })
    .click();
  await expect(
    people.locator(".learning-row").filter({
      has: page.getByRole("heading", { name: "Blue team", exact: true }),
    }),
  ).toContainText("Version 1");
  const csv =
    "id,name,role,active,managerId,preferredLanguage,interests,customFields\ne2e-import,Imported learner,learner,true,manager,en,[],[]";
  await people.getByLabel("User CSV", { exact: true }).fill(csv);
  await people
    .getByRole("button", { name: "Dry-run user import", exact: true })
    .click();
  await expect(
    people.getByRole("status").filter({ hasText: "Valid review" }),
  ).toContainText("1 users");
  await people
    .getByRole("button", { name: "Import reviewed users", exact: true })
    .click();
  await expect(
    people.locator(".learning-row").filter({
      has: page.getByRole("heading", {
        name: "Imported learner",
        exact: true,
      }),
    }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await people
    .getByRole("button", {
      name: "Export all authorized users CSV",
      exact: true,
    })
    .click();
  expect((await download).suggestedFilename()).toBe("pear-users.csv");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, "e2e-person");
  await page
    .getByRole("button", { name: "Learning preferences", exact: true })
    .click();
  await page
    .getByLabel("Learning interests · one per line", { exact: true })
    .fill("Systems\nSecurity");
  await page
    .getByRole("combobox", { name: "Preferred content language", exact: true })
    .selectOption("vi");
  await page
    .getByRole("button", { name: "Save learning preferences", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Learning preferences saved",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Learning preferences", exact: true })
    .click();
  await expect(
    page.getByLabel("Learning interests · one per line", { exact: true }),
  ).toHaveValue("Systems\nSecurity");
  await expect(
    page.getByRole("combobox", {
      name: "Preferred content language",
      exact: true,
    }),
  ).toHaveValue("vi");
  await expect(
    page.getByRole("button", { name: "Administration", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "artifacts/people-preferences-tablet.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, "manager");
  await page
    .getByRole("button", { name: "Administration", exact: true })
    .click();
  await expect(
    people.getByRole("form", { name: "User editor", exact: true }),
  ).toHaveCount(0);
  await expect(people).toContainText("Original learner");
  await expect(people).not.toContainText("learner-b");
});
