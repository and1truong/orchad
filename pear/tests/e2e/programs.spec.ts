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
test("human program authoring, external evidence, scoped assessor moderation and persisted certificate", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "admin");
  await page
    .getByRole("button", { name: "Administration", exact: true })
    .click();
  const editor = page.getByRole("form", { name: "Program editor" });
  await editor.getByLabel("Collection ID", { exact: true }).fill("e2e-program");
  await editor
    .getByLabel("Program title", { exact: true })
    .fill("Evidence practice award");
  await editor
    .getByRole("combobox", { name: "Reference type", exact: true })
    .selectOption("external");
  await editor
    .getByLabel("Published reference ID · external learning key", {
      exact: true,
    })
    .fill("own-practice");
  await editor
    .getByRole("button", { name: "Save program draft", exact: true })
    .click();
  const row = page
    .getByRole("region", { name: "Programs", exact: true })
    .locator(".learning-row")
    .filter({
      has: page.getByRole("heading", {
        name: "Evidence practice award",
        exact: true,
      }),
    });
  await expect(row).toBeVisible();
  await row
    .getByRole("button", { name: "Publish program", exact: true })
    .click();
  await expect(row).toContainText("Version 1");
  await page
    .getByLabel("Assessed award ID", { exact: true })
    .fill("e2e-program");
  await page
    .getByLabel("Assessor account ID", { exact: true })
    .fill("assessor");
  await page
    .getByRole("button", { name: "Save assessor scope", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save assessor scope", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, "learner-a");
  await page.getByRole("button", { name: "Programs", exact: true }).click();
  const card = page.locator(".learning-row").filter({
    has: page.getByRole("heading", {
      name: "Evidence practice award",
      exact: true,
    }),
  });
  await card
    .getByRole("button", { name: "Enroll in award", exact: true })
    .click();
  // A real browser-generated PDF, retained as private evidence.
  const bytes = await page.pdf({ format: "A4" });
  await page
    .getByLabel("I own this content and may upload it", { exact: true })
    .check();
  await page
    .getByLabel("Content file", { exact: true })
    .setInputFiles({
      name: "personal-practice.pdf",
      mimeType: "application/pdf",
      buffer: bytes,
    });
  await expect(
    page.getByRole("status").filter({ hasText: "Evidence PDF attached" }),
  ).toBeVisible();
  await page
    .getByLabel("Evidence · personal statement or reference", { exact: true })
    .fill("I completed one hour of original practice.");
  await page
    .getByLabel("I confirm this evidence describes my own external learning.", {
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Submit external learning", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Programs", exact: true }),
  ).toContainText("1 claimed · pending");
  await expect(
    page.getByRole("button", { name: "Award certificate", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, "assessor");
  await page
    .getByRole("button", { name: "Administration", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Assign learning", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("form", { name: "Program editor" })).toHaveCount(
    0,
  );
  await page
    .getByLabel("Moderation award ID", { exact: true })
    .fill("e2e-program");
  await page
    .getByRole("button", { name: "Load submissions", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Programs", exact: true }),
  ).toContainText("I completed one hour of original practice.");
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Download document", exact: true })
    .click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe("Award evidence.pdf");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  expect(Buffer.concat(chunks).equals(bytes)).toBe(true);
  await page
    .getByLabel("Decision reason", { exact: true })
    .fill("Verified original practice evidence.");
  await page
    .getByRole("button", { name: "Record moderation decision", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Record moderation decision",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, "learner-a");
  await page.getByRole("button", { name: "Programs", exact: true }).click();
  await page
    .getByRole("button", { name: "Award certificate", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Award completion certificate",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download award certificate", exact: true }),
  ).toHaveAttribute("download", /pear-award-/);
  await page.reload();
  await page.getByRole("button", { name: "Programs", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Award certificate", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "artifacts/award-mobile.png", fullPage: true });
});
