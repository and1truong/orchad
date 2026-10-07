import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, id: string) {
  await page.goto("/");
  await page.getByLabel("Account", { exact: true }).fill(id);
  await page.getByLabel("Password", { exact: true }).fill(id + "-dev");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
}
test("human authors mixed quiz, learner saves responses, delegated assessor grades and certificate persists", async ({
  page,
}) => {
  test.setTimeout(60000);
  await login(page, "admin");
  await page
    .getByRole("button", { name: "Administration", exact: true })
    .click();
  const user = page.getByRole("form", { name: "User editor", exact: true });
  await user.getByLabel("User ID", { exact: true }).fill("e2e-assessment");
  await user
    .getByLabel("User name", { exact: true })
    .fill("Assessment learner");
  await user.getByRole("button", { name: "Save user", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "People and groups", exact: true }),
  ).toContainText("Assessment learner");
  const editor = page.getByRole("region", { name: "Course authoring" });
  await editor.getByLabel("Course ID", { exact: true }).fill("e2e-mixed");
  await editor
    .getByLabel("Title", { exact: true })
    .fill("Mixed human assessment");
  await editor
    .getByLabel("Summary", { exact: true })
    .fill("Original mixed assessment browser evidence");
  await editor
    .getByLabel("First lesson text")
    .fill("Study the meaning and explain your practice.");
  await editor.getByLabel("Pass score").fill("75");
  await editor.getByLabel("Maximum attempts").fill("1");
  const first = editor.getByRole("group", { name: "Question 1", exact: true });
  await first.getByLabel("First quiz question").fill("Who chooses the answer?");
  await first.getByLabel("Option A", { exact: true }).fill("Learner");
  await first.getByLabel("Option B", { exact: true }).fill("Agent");
  await first.getByLabel("Correct option").selectOption("0");
  await editor
    .getByRole("button", { name: "Add question", exact: true })
    .click();
  const matching = editor.getByRole("group", {
    name: "Question 2",
    exact: true,
  });
  await matching
    .getByLabel("Quiz question", { exact: true })
    .fill("Match the terms");
  await matching
    .getByLabel("Question type", { exact: true })
    .selectOption("matching");
  await matching.getByLabel("Matching term 1", { exact: true }).fill("First");
  await matching.getByLabel("Matching meaning 1", { exact: true }).fill("One");
  await matching.getByLabel("Matching term 2", { exact: true }).fill("Second");
  await matching.getByLabel("Matching meaning 2", { exact: true }).fill("Two");
  await editor
    .getByRole("button", { name: "Add question", exact: true })
    .click();
  const blanks = editor.getByRole("group", { name: "Question 3", exact: true });
  await blanks
    .getByLabel("Quiz question", { exact: true })
    .fill("Fill the word");
  await blanks
    .getByLabel("Question type", { exact: true })
    .selectOption("blanks");
  await blanks
    .getByLabel("Blank label 1", { exact: true })
    .fill("Study action");
  await blanks.getByLabel("Expected word 1", { exact: true }).fill("Review");
  await editor
    .getByRole("button", { name: "Add question", exact: true })
    .click();
  const essay = editor.getByRole("group", { name: "Question 4", exact: true });
  await essay
    .getByLabel("Quiz question", { exact: true })
    .fill("Explain your practice");
  await essay
    .getByLabel("Question type", { exact: true })
    .selectOption("long_answer");
  await essay.getByLabel("Question points", { exact: true }).fill("5");
  await essay
    .getByLabel("Assessment rubric", { exact: true })
    .fill("Five points for a concrete explanation of your own study.");
  await editor.getByLabel("Shuffle question order per attempt").check();
  await editor.getByLabel("Shuffle choices per attempt").check();
  await editor
    .getByLabel("Answer release", { exact: true })
    .selectOption("after_pass");
  await editor.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Draft saved" }),
  ).toBeVisible();
  const row = page
    .locator(".learning-row")
    .filter({
      has: page.getByRole("heading", {
        name: "Mixed human assessment",
        exact: true,
      }),
    });
  await row.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(row).toContainText("published");
  const reviews = page.getByRole("region", {
    name: "Assessment reviews",
    exact: true,
  });
  await reviews
    .getByLabel("Assessment course ID", { exact: true })
    .fill("e2e-mixed");
  await reviews
    .getByRole("button", { name: "Save course assessor", exact: true })
    .click();
  await expect(reviews.getByRole("status")).toContainText("delegated");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, "e2e-assessment");
  const card = page
    .locator("article")
    .filter({
      has: page.getByRole("heading", {
        name: "Mixed human assessment",
        exact: true,
      }),
    });
  await card.getByRole("button", { name: "Enroll", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your next steps", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Continue learning", exact: true })
    .click();
  await page
    .getByRole("button", { name: "I have studied this lesson", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start assessment", exact: true })
    .click();
  await page.getByLabel("Learner", { exact: true }).check();
  const m = page.getByRole("group", {
    name: "Match the terms · 1 points",
    exact: true,
  });
  await m.getByLabel("First", { exact: true }).selectOption({ label: "One" });
  await m.getByLabel("Second", { exact: true }).selectOption({ label: "Two" });
  await m.getByRole("button", { name: "Save response", exact: true }).click();
  await expect(m).toContainText("Response saved.");
  const b = page.getByRole("group", {
    name: "Fill the word · 1 points",
    exact: true,
  });
  await b.getByLabel("Study action", { exact: true }).fill(" review ");
  await b.getByRole("button", { name: "Save response", exact: true }).click();
  await expect(b).toContainText("Response saved.");
  const e = page.getByRole("group", {
    name: "Explain your practice · 5 points",
    exact: true,
  });
  await e
    .getByLabel("Your own written response", { exact: true })
    .fill("I tested myself on a concrete example and reviewed my errors.");
  await e.getByRole("button", { name: "Save response", exact: true }).click();
  await expect(e).toContainText("Response saved.");
  await page
    .getByRole("button", { name: "Confirm and submit my answers", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Awaiting human assessment" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Certificate", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, "assessor");
  await page
    .getByRole("button", { name: "Administration", exact: true })
    .click();
  await reviews
    .getByRole("button", { name: "Review submitted essay", exact: true })
    .click();
  const submission = reviews.getByRole("region", {
    name: "Submitted essay",
    exact: true,
  });
  await expect(submission).toContainText(
    "I tested myself on a concrete example",
  );
  await submission.getByLabel("Rubric points", { exact: true }).fill("5");
  await submission
    .getByLabel("Assessment reason", { exact: true })
    .fill("Concrete study and review are explained.");
  await submission
    .getByRole("button", { name: "Commit human rubric review", exact: true })
    .click();
  await expect(reviews.getByRole("status")).toContainText(
    "Official score: 100%",
  );
  await page.screenshot({ path: "artifacts/essay-review.png", fullPage: true });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, "e2e-assessment");
  await page.getByRole("button", { name: "My learning", exact: true }).click();
  await page.getByRole("button", { name: "Certificate", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Completion certificate", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Transcript", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Learning transcript", exact: true }),
  ).toContainText("completed");
});
