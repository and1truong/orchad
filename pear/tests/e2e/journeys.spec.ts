import { execFileSync } from "node:child_process";
import { test, expect } from "@playwright/test";
async function login(page: any, user = "learner-a") {
  await page.goto("/");
  await page.getByLabel("Account", { exact: true }).fill(user);
  await page.getByLabel("Password", { exact: true }).fill(user + "-dev");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
}

test("human learning: filter, preview, save/enroll, prerequisite, quiz, reload/resume, certificate", async ({
  page,
}) => {
  await login(page);
  await page.getByLabel("Content language").selectOption("vi");
  await expect(page.locator("article")).toHaveCount(1);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Course preview" }),
  ).toContainText("100%");
  await page.getByRole("button", { name: "Close preview" }).click();
  await page
    .getByRole("button", { name: "Save Học tập có chủ đích", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("saved");
  await page.getByRole("button", { name: "Enroll", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your next steps" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "My learning", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Học tập có chủ đích" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue learning" }).click();
  await page
    .getByRole("button", { name: "I have studied this lesson" })
    .click();
  await expect(
    page.getByRole("button", { name: "Lesson acknowledged ✓" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Start assessment" }).click();
  await page.getByLabel("Tự giải thích rồi đối chiếu", { exact: true }).check();
  await expect(
    page.getByRole("button", { name: "Confirm and submit my answers" }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Confirm and submit my answers" })
    .click();
  await expect(page.getByRole("status")).toContainText("Score: 100%");
  await page.getByRole("button", { name: "Certificate", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Completion certificate" }),
  ).toBeVisible();
  await expect(
    page.getByText("not accredited", { exact: false }),
  ).toBeVisible();
  await page.evaluate(() => {
    window.print = () => {};
  });
  await page
    .getByRole("button", { name: "Print / save certificate PDF", exact: true })
    .click();
  await page.pdf({
    path: "artifacts/course-certificate.pdf",
    preferCSSPageSize: true,
  });
  const certificateText = execFileSync(
    "pdftotext",
    ["artifacts/course-certificate.pdf", "-"],
    { encoding: "utf8" },
  );
  expect(certificateText).toContain("Học tập có chủ đích");
  expect(certificateText).toContain("Certificate ID:");
  expect(certificateText).not.toContain("Your next steps");
  expect(certificateText).not.toContain("Private feedback");
  await page.getByText("Rate this completed version", { exact: true }).click();
  const feedback = page.getByRole("form", {
    name: "Course feedback",
    exact: true,
  });
  await feedback
    .getByRole("combobox", { name: "Your rating", exact: true })
    .selectOption("4");
  await feedback
    .getByLabel("Private feedback", { exact: true })
    .fill("Luyện tập rất hữu ích. Private comment, not an official score.");
  await feedback
    .getByLabel("I confirm this rating and feedback express my own opinion.", {
      exact: true,
    })
    .check();
  await feedback
    .getByRole("button", { name: "Save course feedback", exact: true })
    .click();
  await expect(feedback.getByRole("status")).toContainText("Feedback saved");
  await page.screenshot({
    path: "artifacts/human-completion.png",
    fullPage: true,
  });
  await page.reload();
  await page.getByRole("button", { name: "My learning", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Certificate", exact: true }),
  ).toBeVisible();
  await page.getByText("Rate this completed version", { exact: true }).click();
  await expect(
    page.getByLabel("Private feedback", { exact: true }),
  ).toHaveValue(
    "Luyện tập rất hữu ích. Private comment, not an official score.",
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, "admin");
  await page
    .getByRole("button", { name: "Administration", exact: true })
    .click();
  const review = page.getByRole("region", {
    name: "Private course feedback",
    exact: true,
  });
  await review
    .getByLabel("Feedback course ID", { exact: true })
    .fill("learning-vi");
  await review
    .getByRole("button", { name: "Load private feedback", exact: true })
    .click();
  await expect(review).toContainText("Luyện tập rất hữu ích.");
});

test("admin creates/publishes/assigns; learner and manager scopes stay distinct", async ({
  page,
}) => {
  await login(page, "admin");
  await page
    .getByRole("button", { name: "Administration", exact: true })
    .click();
  await page.getByLabel("Course ID", { exact: true }).fill("e2e-course");
  await page
    .getByLabel("Title", { exact: true })
    .fill("Browser verified course");
  await page
    .getByLabel("Summary", { exact: true })
    .fill("Self-authored browser fixture");
  await page.getByLabel("First lesson text").fill("Learn safely.");
  await page
    .getByLabel("First quiz question")
    .fill("Who submits graded answers?");
  await page.getByLabel("Option A").fill("The learner");
  await page.getByLabel("Option B").fill("The tutor");
  await page.getByLabel("Correct option").selectOption("0");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved");
  const row = page.locator(".learning-row").filter({
    has: page.getByRole("heading", { name: "Browser verified course" }),
  });
  await row.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("published");
  await page.getByLabel("Course", { exact: true }).selectOption("e2e-course");
  await page.getByLabel("Learner", { exact: true }).selectOption("learner-b");
  await page
    .getByRole("button", { name: "Assign course", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Assignment committed");
  await page.screenshot({
    path: "artifacts/admin-assignment.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, "learner-b");
  await expect(
    page.getByRole("button", { name: "Administration", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "My learning", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Browser verified course" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, "manager");
  await page
    .getByRole("button", { name: "Administration", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Create course draft" }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Learner", { exact: true }).locator("option"),
  ).toHaveCount(1);
  for (const body of await page.locator("tbody").all())
    await expect(body).not.toContainText("learner-b");
});

test("responsive keyboard access and real page bridge, with session/page workspace invalidation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "learner-a");
  await expect(
    page.getByRole("button", { name: "Explore", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
  const before = await page.evaluate(
    async () => await window.agentBridgeV1!.getContext(),
  );
  expect(before.appId).toBe("orchard-pear");
  const tools = await page.evaluate(
    async () => await window.agentBridgeV1!.describe(),
  );
  expect(tools.tools.some((t) => t.name === "human_submit_attempt")).toBe(
    false,
  );
  const result = await page.evaluate(async () => {
    const ctx = await window.agentBridgeV1!.getContext();
    return window.agentBridgeV1!.invoke({
      requestId: "browser-read",
      documentId: ctx.documentId,
      toolName: "learning_search",
      arguments: { maxDuration: 20 },
      expectedRevision: null,
      idempotencyKey: null,
    });
  });
  expect(result.ok).toBe(true);
  await page.screenshot({
    path: "artifacts/mobile-catalog.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.agentBridgeV1)).toBeUndefined();
  await login(page, "learner-b");
  const after = await page.evaluate(
    async () => await window.agentBridgeV1!.getContext(),
  );
  expect(after.documentId).not.toBe(before.documentId);
  expect(after.sessionEpoch).not.toBe(before.sessionEpoch);
});
