import { test, expect } from "@playwright/test";
test("same-origin production build serves human UI and bridge, excludes harness and dev runtime", async ({
  page,
  request,
}) => {
  const html = await (await request.get("/")).text();
  expect(html).not.toContain("@vite/client");
  expect(html).toContain("/assets/index-");
  expect((await request.get("/harness/index.html")).status()).toBe(404);
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".graph-card")).toHaveCount(3);
  await page.getByRole("button", { name: "+ Add node" }).click();
  await expect(page.locator(".graph-card")).toHaveCount(4);
  await page.reload();
  await expect(page.locator(".graph-card")).toHaveCount(4);
  const descriptor = await page.evaluate(() =>
    window.agentBridgeV1!.describe(),
  );
  expect(descriptor.protocolVersion).toBe("0.1");
  expect(descriptor.tools).toHaveLength(7);
  const ctx = await page.evaluate(() => window.agentBridgeV1!.getContext());
  expect(ctx.revision).toBe(1);
  expect(ctx.summary.length).toBeLessThan(401);
  expect(await page.evaluate(() => document.cookie)).not.toContain("session");
  const response = await request.get("/health");
  expect(await response.json()).toEqual({ ok: true });
});
