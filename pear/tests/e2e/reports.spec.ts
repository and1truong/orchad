import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { parseCsv } from "../../src/shared/csv.ts";
async function login(page: Page, id: string) {
  await page.goto("/");
  await page.getByLabel("Account", { exact: true }).fill(id);
  await page.getByLabel("Password", { exact: true }).fill(id + "-dev");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
}
test("human report builder saves owner definition, exports reviewed columns, and prints scoped transcript", async ({
  page,
}) => {
  await login(page, "learner-b");
  await page.getByLabel("Content language").selectOption("vi");
  await page
    .locator("article")
    .filter({
      has: page.getByRole("heading", {
        name: "Học tập có chủ đích",
        exact: true,
      }),
    })
    .getByRole("button", { name: "Enroll", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your next steps", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Transcript", exact: true }).click();
  const transcript = page.getByRole("region", {
    name: "Learning transcript",
    exact: true,
  });
  await expect(
    transcript.getByRole("heading", { name: "Your transcript", exact: true }),
  ).toBeVisible();
  const d = page.waitForEvent("download");
  await transcript
    .getByRole("button", { name: "Download transcript CSV", exact: true })
    .click();
  const download = await d;
  expect(download.suggestedFilename()).toBe("pear-transcript.csv");
  const csv = parseCsv(await readFile((await download.path())!, "utf8"));
  expect(csv[0]).toContain("title");
  await page.evaluate(() => {
    window.print = () => {};
  });
  await transcript
    .getByRole("button", { name: "Print / save transcript PDF", exact: true })
    .click();
  const print = page.getByRole("region", {
    name: "Export print view",
    exact: true,
  });
  await expect(print).toContainText("Authorized ledger snapshot");
  await expect(print).not.toContainText("learner-a");
  const pdf = await page.pdf({
    path: "artifacts/transcript.pdf",
    preferCSSPageSize: true,
  });
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, "manager");
  await page
    .getByRole("button", { name: "Administration", exact: true })
    .click();
  const report = page.getByRole("region", {
    name: "Report builder",
    exact: true,
  });
  await expect(
    report.getByRole("heading", { name: "Learning reports", exact: true }),
  ).toBeVisible();
  await report.getByLabel("Report ID", { exact: true }).fill("e2e-report");
  await report
    .getByLabel("Report title", { exact: true })
    .fill("Direct reports only");
  await report
    .getByLabel("Report keywords", { exact: true })
    .fill("no-such-learning");
  await report
    .getByRole("button", { name: "Save own report", exact: true })
    .click();
  await expect(report.getByRole("status")).toContainText("Own report saved");
  await report
    .getByRole("button", { name: "Open saved report", exact: true })
    .click();
  await expect(report.getByLabel("Report title", { exact: true })).toHaveValue(
    "Direct reports only",
  );
  const filtered = page.waitForEvent("download");
  await report
    .getByRole("button", { name: "Download report CSV", exact: true })
    .click();
  const file = await filtered;
  expect(parseCsv(await readFile((await file.path())!, "utf8")).length).toBe(1);
  await report.getByLabel("Export rows", { exact: true }).selectOption("all");
  await report
    .getByLabel("Export columns", { exact: true })
    .selectOption("all");
  const all = page.waitForEvent("download");
  await report
    .getByRole("button", { name: "Download report CSV", exact: true })
    .click();
  const full = parseCsv(await readFile((await (await all).path())!, "utf8"));
  expect(full[0]).toHaveLength(19);
  expect(full.slice(1).every((r) => r[0] !== "learner-b")).toBe(true);
  await report
    .getByRole("button", { name: "Delete saved report", exact: true })
    .click();
  await expect(report.getByRole("status")).toContainText(
    "learning records preserved",
  );
  await page.screenshot({
    path: "artifacts/reports-manager.png",
    fullPage: true,
  });
});
