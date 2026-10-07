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
async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
}
async function resume(page: Page) {
  await page.getByRole("button", { name: "My learning", exact: true }).click();
  const row = page.locator(".learning-row").filter({
    has: page.getByRole("heading", {
      name: "Blended original workshop",
      exact: true,
    }),
  });
  await row
    .getByRole("button", { name: "Continue learning", exact: true })
    .click();
}
test("human authors submission/event, learner submits and books, scoped assessor reviews attendance, then quiz completes", async ({
  page,
}) => {
  test.setTimeout(90000);
  const identityErrors: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /same key|unique.*key/.test(message.text())
    )
      identityErrors.push(message.text());
  });
  await login(page, "admin");
  await page
    .getByRole("button", { name: "Administration", exact: true })
    .click();
  const user = page.getByRole("form", { name: "User editor", exact: true });
  await user.getByLabel("User ID", { exact: true }).fill("e2e-blended");
  await user.getByLabel("User name", { exact: true }).fill("Blended learner");
  await user.getByRole("button", { name: "Save user", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "People and groups", exact: true }),
  ).toContainText("Blended learner");
  const editor = page.getByRole("region", { name: "Course authoring" });
  await editor
    .getByLabel("Course ID", { exact: true })
    .fill("e2e-blended-course");
  await editor
    .getByLabel("Title", { exact: true })
    .fill("Blended original workshop");
  await editor
    .getByLabel("Summary", { exact: true })
    .fill("Original submission and event browser evidence");
  const l1 = editor.getByRole("group", { name: "Lesson 1", exact: true });
  await l1
    .getByLabel("Lesson title", { exact: true })
    .fill("Written assignment");
  await l1
    .getByLabel("First lesson text", { exact: true })
    .fill("Submit your own original explanation.");
  await l1
    .getByRole("combobox", { name: "Lesson format", exact: true })
    .selectOption("submission");
  await l1
    .getByLabel("Submission rubric", { exact: true })
    .fill("Explain the reasoning in your own words");
  await editor.getByRole("button", { name: "Add lesson", exact: true }).click();
  const l2 = editor.getByRole("group", { name: "Lesson 2", exact: true });
  await l2.getByLabel("Lesson title", { exact: true }).fill("Human workshop");
  await l2
    .getByLabel("Lesson text", { exact: true })
    .fill("Attend the real instructor session");
  await l2
    .getByRole("combobox", { name: "Lesson format", exact: true })
    .selectOption("event");
  await l2
    .getByRole("group", { name: "Complete these lessons first", exact: true })
    .getByLabel("Written assignment", { exact: true })
    .check();
  const start = Date.now() + 30000;
  await l2.getByLabel("Session ID", { exact: true }).fill("e2e-workshop");
  await l2
    .getByLabel("Session start", { exact: true })
    .fill(new Date(start).toISOString());
  await l2
    .getByLabel("Session end", { exact: true })
    .fill(new Date(start + 3600000).toISOString());
  await l2
    .getByLabel("Booking cutoff", { exact: true })
    .fill(new Date(start - 2000).toISOString());
  await l2
    .getByLabel("Session timezone", { exact: true })
    .fill("America/New_York");
  await l2.getByLabel("Session capacity", { exact: true }).fill("2");
  const q = editor.getByRole("group", { name: "Question 1", exact: true });
  await q
    .getByLabel("First quiz question")
    .fill("Who confirms real attendance?");
  await q
    .getByLabel("Option A", { exact: true })
    .fill("Authorized human instructor");
  await q
    .getByLabel("Option B", { exact: true })
    .fill("An untrusted package script");
  await q.getByLabel("Correct option").selectOption("0");
  await editor.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved");
  const courseRow = page.locator(".admin-courses .learning-row").filter({
    has: page.getByRole("heading", {
      name: "Blended original workshop",
      exact: true,
    }),
  });
  await courseRow.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("published");
  const delegation = page.getByRole("form", {
    name: "Course assessor delegation",
    exact: true,
  });
  await delegation
    .getByLabel("Assessment course ID", { exact: true })
    .fill("e2e-blended-course");
  await delegation
    .getByRole("button", { name: "Save course assessor", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Course assessor delegated." }),
  ).toBeVisible();
  await signOut(page);
  await login(page, "e2e-blended");
  const card = page.locator("article").filter({
    has: page.getByRole("heading", {
      name: "Blended original workshop",
      exact: true,
    }),
  });
  await card.getByRole("button", { name: "Enroll", exact: true }).click();
  await resume(page);
  const player = page.getByRole("region", {
    name: "Blended lesson",
    exact: true,
  });
  await expect(
    page.getByRole("button", {
      name: "I have studied this lesson",
      exact: true,
    }),
  ).toBeDisabled();
  await player
    .getByLabel("I own this content and may upload it", { exact: true })
    .check();
  await player.getByLabel("Content file", { exact: true }).setInputFiles({
    name: "original-assignment.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nOriginal human-written answer\n%%EOF"),
  });
  await expect(player.getByRole("status")).toContainText("Stored");
  await player
    .getByRole("button", { name: "Submit assignment for review", exact: true })
    .click();
  await expect(player).toContainText("Submission 1 · pending");
  await expect(
    page.getByRole("button", { name: "Start assessment", exact: true }),
  ).toBeDisabled();
  await signOut(page);
  await login(page, "assessor");
  await page
    .getByRole("button", { name: "Administration", exact: true })
    .click();
  const reviews = page.getByRole("region", {
    name: "Submission and attendance reviews",
    exact: true,
  });
  await reviews
    .getByRole("button", { name: "Review submission", exact: true })
    .click();
  const form = reviews.getByRole("form", {
    name: "Blended review",
    exact: true,
  });
  await expect(form).toContainText("Explain the reasoning");
  await expect(
    form.getByRole("link", { name: "Download document", exact: true }),
  ).toBeVisible();
  await form.getByLabel("Submission score", { exact: true }).fill("85");
  await form
    .getByLabel("Review reason", { exact: true })
    .fill("Original explanation meets the pinned rubric");
  await form
    .getByRole("button", { name: "Record human review", exact: true })
    .click();
  await expect(
    reviews.getByRole("button", { name: "Review submission", exact: true }),
  ).toHaveCount(0);
  await signOut(page);
  await login(page, "e2e-blended");
  await resume(page);
  await page
    .getByRole("button", { name: "Human workshop", exact: true })
    .click();
  await player
    .getByRole("button", { name: "Book session", exact: true })
    .click();
  await expect(player).toContainText("Booking · booked");
  const downloaded = page.waitForEvent("download");
  await player
    .getByRole("button", { name: "Download calendar", exact: true })
    .click();
  expect((await downloaded).suggestedFilename()).toBe("pear-session.ics");
  await expect(player).toContainText("America/New_York");
  await signOut(page);
  await login(page, "assessor");
  await page
    .getByRole("button", { name: "Administration", exact: true })
    .click();
  await reviews
    .getByRole("button", { name: "Review event", exact: true })
    .click();
  await form
    .getByLabel("Review reason", { exact: true })
    .fill("Human instructor observed actual participation");
  await expect(form.getByLabel("Review reason", { exact: true })).toHaveValue(
    "Human instructor observed actual participation",
  );
  await expect.poll(() => Date.now() >= start, { timeout: 35000 }).toBe(true);
  await expect(form.getByLabel("Review reason", { exact: true })).toHaveValue(
    "Human instructor observed actual participation",
  );
  await form
    .getByRole("button", { name: "Record human review", exact: true })
    .click();
  await expect(
    reviews.getByRole("button", { name: "Review event", exact: true }),
  ).toHaveCount(0);
  await signOut(page);
  await login(page, "e2e-blended");
  await resume(page);
  await page
    .getByRole("button", { name: "Start assessment", exact: true })
    .click();
  await page.getByLabel("Authorized human instructor", { exact: true }).check();
  await page
    .getByRole("button", { name: "Confirm and submit my answers", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Certificate", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Transcript", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Learning transcript", exact: true }),
  ).toContainText("completed");
  expect(identityErrors).toEqual([]);
  await page.screenshot({
    path: "artifacts/blended-transcript.png",
    fullPage: true,
  });
});
