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
test("legacy course editor preserves every lesson/choice and fits mobile/tablet", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "admin");
  await page
    .getByRole("button", { name: "Administration", exact: true })
    .click();
  const row = page.locator(".admin-courses .learning-row").filter({
    has: page.getByRole("heading", {
      name: "Reliable systems basics",
      exact: true,
    }),
  });
  await row.getByRole("button", { name: "Edit draft", exact: true }).click();
  const editor = page.getByRole("region", { name: "Course authoring" });
  await expect(
    editor.getByRole("group", { name: "Lesson 2", exact: true }),
  ).toBeVisible();
  const second = editor.getByRole("group", { name: "Question 2", exact: true });
  await expect(
    second.getByRole("textbox", { name: "Option C", exact: true }),
  ).toHaveValue("Reconcile the original operation key");
  await expect(
    second.getByRole("combobox", { name: "Correct option", exact: true }),
  ).toHaveValue("2");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 768, height: 1024 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await editor.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved");
  await page.reload();
  await page
    .getByRole("button", { name: "Administration", exact: true })
    .click();
  await row.getByRole("button", { name: "Edit draft", exact: true }).click();
  await expect(
    second.getByRole("textbox", { name: "Option C", exact: true }),
  ).toHaveValue("Reconcile the original operation key");
  await page.screenshot({
    path: "artifacts/tablet-authoring.png",
    fullPage: true,
  });
});
test("human authoring: reusable version, two modules, three lessons, two questions, draft preview and immutable learner completion", async ({
  page,
}) => {
  await login(page, "editor");
  await page
    .getByRole("button", { name: "Administration", exact: true })
    .click();
  const library = page.getByRole("region", {
    name: "Reusable content library",
  });
  await library.getByLabel("Item ID", { exact: true }).fill("e2e-source");
  await library
    .getByLabel("Item title", { exact: true })
    .fill("Pinned original lesson");
  await library
    .getByLabel("Item summary", { exact: true })
    .fill("Self-authored version fixture");
  await library
    .getByRole("textbox", { name: "Item text", exact: true })
    .fill("Version one remains part of the published course.");
  await library
    .getByRole("button", { name: "Save item draft", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Item draft saved");
  const itemRow = library.locator(".learning-row").filter({
    has: page.getByRole("heading", {
      name: "Pinned original lesson",
      exact: true,
    }),
  });
  await itemRow
    .getByRole("button", { name: "Publish item", exact: true })
    .click();
  await expect(itemRow).toContainText("Published version 1");
  const editor = page.getByRole("region", { name: "Course authoring" });
  await editor.getByLabel("Course ID", { exact: true }).fill("e2e-modular");
  await editor
    .getByLabel("Title", { exact: true })
    .fill("Modular authored course");
  await editor
    .getByLabel("Summary", { exact: true })
    .fill("Two modules and a pinned content item");
  await editor.getByLabel("Duration in minutes").fill("25");
  await editor.getByLabel("Maximum attempts").fill("3");
  const module1 = editor.getByRole("group", { name: "Module 1", exact: true });
  await module1.getByLabel("Module title", { exact: true }).fill("Foundations");
  await module1
    .getByRole("combobox", { name: "Content source", exact: true })
    .selectOption("e2e-source:1");
  await expect(module1.getByLabel("First lesson text")).toBeDisabled();
  await editor.getByRole("button", { name: "Add module", exact: true }).click();
  const module2 = editor.getByRole("group", { name: "Module 2", exact: true });
  await module2.getByLabel("Module title", { exact: true }).fill("Application");
  await module2
    .getByRole("group", { name: "Complete these modules first", exact: true })
    .getByLabel("Foundations", { exact: true })
    .check();
  const lesson2 = editor.getByRole("group", { name: "Lesson 2", exact: true });
  await lesson2
    .getByLabel("Lesson title", { exact: true })
    .fill("Read the reference");
  await lesson2
    .getByRole("combobox", { name: "Lesson format", exact: true })
    .selectOption("link");
  await lesson2
    .getByLabel("Lesson text", { exact: true })
    .fill("A safe HTTPS reference lesson.");
  await lesson2
    .getByLabel("HTTPS media URL", { exact: true })
    .fill("https://example.org/reference");
  await module2
    .getByRole("button", { name: "Add lesson", exact: true })
    .click();
  const lesson3 = editor.getByRole("group", { name: "Lesson 3", exact: true });
  await lesson3
    .getByLabel("Lesson title", { exact: true })
    .fill("Apply the lesson");
  await lesson3
    .getByLabel("Lesson text", { exact: true })
    .fill("Summarize what you learned.");
  await lesson3
    .getByRole("group", { name: "Complete these lessons first", exact: true })
    .getByLabel("Read the reference", { exact: true })
    .check();
  const q1 = editor.getByRole("group", { name: "Question 1", exact: true });
  await q1.getByLabel("First quiz question").fill("Which version is pinned?");
  await q1.getByLabel("Option A", { exact: true }).fill("Version one");
  await q1.getByLabel("Option B", { exact: true }).fill("Always latest");
  await q1.getByRole("button", { name: "Add option", exact: true }).click();
  await q1.getByLabel("Option C", { exact: true }).fill("No version");
  await q1.getByLabel("Correct option").selectOption("0");
  await editor
    .getByRole("button", { name: "Add question", exact: true })
    .click();
  const q2 = editor.getByRole("group", { name: "Question 2", exact: true });
  await q2
    .getByLabel("Quiz question", { exact: true })
    .fill("Who confirms learning?");
  await q2.getByLabel("Option A", { exact: true }).fill("The learner");
  await q2.getByLabel("Option B", { exact: true }).fill("The model");
  await editor
    .getByRole("button", { name: "Preview draft", exact: true })
    .click();
  await expect(
    editor.getByRole("region", { name: "Draft preview" }),
  ).toContainText("2 questions");
  await editor.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved");
  await page.reload();
  await page
    .getByRole("button", { name: "Administration", exact: true })
    .click();
  const row = page.locator(".admin-courses .learning-row").filter({
    has: page.getByRole("heading", {
      name: "Modular authored course",
      exact: true,
    }),
  });
  await row.getByRole("button", { name: "Edit draft", exact: true }).click();
  await expect(
    editor.getByRole("group", { name: "Module 2", exact: true }),
  ).toBeVisible();
  await expect(
    editor
      .getByRole("group", { name: "Lesson 3", exact: true })
      .getByLabel("Lesson text"),
  ).toHaveValue("Summarize what you learned.");
  await expect(
    editor
      .getByRole("group", { name: "Question 1", exact: true })
      .getByLabel("Option C", { exact: true }),
  ).toHaveValue("No version");
  await row.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("published");
  await library
    .locator(".learning-row")
    .filter({
      has: page.getByRole("heading", {
        name: "Pinned original lesson",
        exact: true,
      }),
    })
    .getByRole("button", { name: "Edit item draft", exact: true })
    .click();
  await library
    .getByRole("textbox", { name: "Item text", exact: true })
    .fill("Version two is not silently propagated.");
  await library
    .getByRole("button", { name: "Save item draft", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Item draft saved");
  await itemRow
    .getByRole("button", { name: "Publish item", exact: true })
    .click();
  await expect(itemRow).toContainText("Published version 2");
  await editor
    .getByRole("button", { name: "Preview draft", exact: true })
    .click();
  await page.screenshot({
    path: "artifacts/modular-authoring.png",
    fullPage: true,
  });
  await expect(
    page.getByRole("heading", { name: "Assign learning", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, "learner-b");
  const discovery = page.getByRole("region", { name: "Standalone discovery" });
  await discovery
    .getByRole("button", { name: "Read item", exact: true })
    .click();
  await expect(
    discovery.getByRole("region", { name: "Standalone item reader" }),
  ).toContainText("Version two is not silently propagated");
  const courseCard = page.locator("article").filter({
    has: page.getByRole("heading", {
      name: "Modular authored course",
      exact: true,
    }),
  });
  await courseCard.getByRole("button", { name: "Enroll", exact: true }).click();
  await page
    .getByRole("button", { name: "Continue learning", exact: true })
    .click();
  await expect(page.locator(".lesson-text")).toHaveText(
    "Version one remains part of the published course.",
  );
  await page
    .getByRole("button", { name: "Read the reference", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("prerequisite");
  await page
    .getByRole("button", { name: "Pinned original lesson", exact: true })
    .click();
  await page
    .getByRole("button", { name: "I have studied this lesson", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Lesson acknowledged ✓" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Read the reference", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Open learning resource", exact: true }),
  ).toHaveAttribute("href", "https://example.org/reference");
  await page
    .getByRole("button", { name: "I have studied this lesson", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Lesson acknowledged ✓" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Apply the lesson", exact: true })
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
  await page.getByLabel("Version one", { exact: true }).check();
  await expect(
    page.getByRole("button", { name: "Confirm and submit my answers" }),
  ).toBeDisabled();
  await expect(page.getByLabel("The learner", { exact: true })).toBeEnabled();
  await page.getByLabel("The learner", { exact: true }).check();
  await expect(
    page.getByRole("button", { name: "Confirm and submit my answers" }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Confirm and submit my answers" })
    .click();
  await expect(page.getByRole("status")).toContainText("Score: 100%");
  await page.reload();
  await page.getByRole("button", { name: "My learning", exact: true }).click();
  await expect(
    page.locator(".learning-row").filter({
      has: page.getByRole("heading", {
        name: "Modular authored course",
        exact: true,
      }),
    }),
  ).toContainText("3/3 lessons");
});
