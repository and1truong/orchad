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
test("human tracks pinned standalone reading, preserves retired version and exports a separate self-attested transcript row", async ({
  page,
}) => {
  await login(page, "editor");
  await page
    .getByRole("button", { name: "Administration", exact: true })
    .click();
  const library = page.getByRole("region", {
    name: "Reusable content library",
    exact: true,
  });
  await library
    .getByLabel("Item ID", { exact: true })
    .fill("e2e-standalone-ledger");
  await library
    .getByLabel("Item title", { exact: true })
    .fill("Standalone history fixture");
  await library
    .getByLabel("Item summary", { exact: true })
    .fill("Self-authored reading ledger");
  await library
    .getByRole("textbox", { name: "Item text", exact: true })
    .fill("Original version one remains readable after retirement.");
  await library
    .getByRole("button", { name: "Save item draft", exact: true })
    .click();
  const source = library.locator(".learning-row").filter({
    has: page.getByRole("heading", {
      name: "Standalone history fixture",
      exact: true,
    }),
  });
  await source
    .getByRole("button", { name: "Publish item", exact: true })
    .click();
  await expect(source).toContainText("Published version 1");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, "learner-b");
  const card = page.locator(".learning-row").filter({
    has: page.getByRole("heading", {
      name: "Standalone history fixture",
      exact: true,
    }),
  });
  await card.getByRole("button", { name: "Read item", exact: true }).click();
  const reader = page.getByRole("region", {
    name: "Standalone item reader",
    exact: true,
  });
  await reader
    .getByRole("button", { name: "Track this standalone version", exact: true })
    .click();
  await expect(reader).toContainText("Tracked · In progress");
  await expect(
    reader.getByRole("button", {
      name: "Confirm standalone reading",
      exact: true,
    }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, "editor");
  await page
    .getByRole("button", { name: "Administration", exact: true })
    .click();
  await source
    .getByRole("button", { name: "Edit item draft", exact: true })
    .click();
  await library
    .getByRole("textbox", { name: "Item text", exact: true })
    .fill("New replacement body from version two.");
  await library
    .getByRole("button", { name: "Save item draft", exact: true })
    .click();
  await source
    .getByRole("button", { name: "Publish item", exact: true })
    .click();
  await expect(source).toContainText("Published version 2");
  await source
    .getByRole("button", { name: "Retire item", exact: true })
    .click();
  await expect(source).toContainText("retired");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, "learner-b");
  await page.getByRole("button", { name: "My learning", exact: true }).click();
  const tracked = page.getByRole("region", {
    name: "Standalone learning",
    exact: true,
  });
  await tracked
    .getByRole("button", { name: "Open tracked item", exact: true })
    .click();
  await expect(reader).toContainText(
    "Original version one remains readable after retirement.",
  );
  await expect(reader).not.toContainText("New replacement body");
  await reader
    .getByLabel("I confirm I have studied this standalone version.", {
      exact: true,
    })
    .check();
  await reader
    .getByRole("button", { name: "Confirm standalone reading", exact: true })
    .click();
  await expect(reader).toContainText("Reading confirmed");
  await page.reload();
  await page.getByRole("button", { name: "My learning", exact: true }).click();
  await expect(tracked).toContainText("Version 1 · Reading confirmed");
  await page.getByRole("button", { name: "Transcript", exact: true }).click();
  const transcript = page.getByRole("region", {
    name: "Learning transcript",
    exact: true,
  });
  const row = transcript
    .locator("tbody tr")
    .filter({ hasText: "Standalone history fixture" });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("item");
  await expect(row).toContainText("completed");
  await page.screenshot({
    path: "artifacts/standalone-transcript.png",
    fullPage: true,
  });
});
