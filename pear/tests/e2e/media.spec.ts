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
test("human uploads audio, PDF and interactive practice; sandbox cannot reach Pear authority", async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  await login(page, "editor");
  await page
    .getByRole("button", { name: "Administration", exact: true })
    .click();
  const library = page.getByRole("region", {
    name: "Reusable content library",
  });
  const wav = Buffer.alloc(8044);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(8036, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(8000, 40);
  const pdfPage = await context.newPage();
  await pdfPage.setContent(
    "<h1>Original learning guide</h1><p>Internal document fixture</p>",
  );
  const pdf = await pdfPage.pdf();
  await pdfPage.close();
  const mp4 = Buffer.from(
    "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAANebW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAAlgAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAoh0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAAlgAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAACAAAAAgAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAJYAAAQAAABAAAAAAIAbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAoAAAAGABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABq21pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAWtzdGJsAAAAv3N0c2QAAAAAAAAAAQAAAK9hdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAACAAIABIAAAASAAAAAAAAAABFUxhdmM2MC4zMS4xMDIgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAANWF2Y0MBZAAK/+EAGGdkAAqs2UlsBEAAAAMAQAAAAwKDxIllgAEABmjr48siwP34+AAAAAAQcGFzcAAAAAEAAAABAAAAFGJ0cnQAAAAAAAAmzQAAJs0AAAAYc3R0cwAAAAAAAAABAAAAAwAACAAAAAAUc3RzcwAAAAAAAAABAAAAAQAAAChjdHRzAAAAAAAAAAMAAAABAAAQAAAAAAEAABgAAAAAAQAACAAAAAAcc3RzYwAAAAAAAAABAAAAAQAAAAMAAAABAAAAIHN0c3oAAAAAAAAAAAAAAAMAAALQAAAADQAAAAwAAAAUc3RjbwAAAAAAAAABAAADjgAAAGJ1ZHRhAAAAWm1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAALWlsc3QAAAAlqXRvbwAAAB1kYXRhAAAAAQAAAABMYXZmNjAuMTYuMTAwAAAACGZyZWUAAALxbWRhdAAAAq0GBf//qdxF6b3m2Ui3lizYINkj7u94MjY0IC0gY29yZSAxNjQgcjMxMDggMzFlMTlmOSAtIEguMjY0L01QRUctNCBBVkMgY29kZWMgLSBDb3B5bGVmdCAyMDAzLTIwMjMgLSBodHRwOi8vd3d3LnZpZGVvbGFuLm9yZy94MjY0Lmh0bWwgLSBvcHRpb25zOiBjYWJhYz0xIHJlZj0zIGRlYmxvY2s9MTowOjAgYW5hbHlzZT0weDM6MHgxMTMgbWU9aGV4IHN1Ym1lPTcgcHN5PTEgcHN5X3JkPTEuMDA6MC4wMCBtaXhlZF9yZWY9MSBtZV9yYW5nZT0xNiBjaHJvbWFfbWU9MSB0cmVsbGlzPTEgOHg4ZGN0PTEgY3FtPTAgZGVhZHpvbmU9MjEsMTEgZmFzdF9wc2tpcD0xIGNocm9tYV9xcF9vZmZzZXQ9LTIgdGhyZWFkcz0xIGxvb2thaGVhZF90aHJlYWRzPTEgc2xpY2VkX3RocmVhZHM9MCBucj0wIGRlY2ltYXRlPTEgaW50ZXJsYWNlZD0wIGJsdXJheV9jb21wYXQ9MCBjb25zdHJhaW5lZF9pbnRyYT0wIGJmcmFtZXM9MyBiX3B5cmFtaWQ9MiBiX2FkYXB0PTEgYl9iaWFzPTAgZGlyZWN0PTEgd2VpZ2h0Yj0xIG9wZW5fZ29wPTAgd2VpZ2h0cD0yIGtleWludD0yNTAga2V5aW50X21pbj01IHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAgcmM9Y3JmIG1idHJlZT0xIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAAG2WIhAAR//7n4/wKbXzEcTp2GPr31tds+/BvgQAAAAlBmiJsQ//+q4AAAAAIAZ5BeQ//REE=",
    "base64",
  );
  const html =
    Buffer.from(`<!doctype html><html><head><title>Isolated practice</title></head><body><button id="practice" onclick="this.textContent='Practiced'">Practice</button><p id="isolation"></p><script>
 let result=[];try{parent.document.body;result.push('DOM exposed')}catch{result.push('DOM blocked')}
 try{parent.agentBridgeV1;result.push('Bridge exposed')}catch{result.push('Bridge blocked')}
 try{document.cookie;result.push('cookie exposed')}catch{result.push('cookie blocked')}
 try{localStorage.getItem('secret');result.push('storage exposed')}catch{result.push('storage blocked')}
 document.querySelector('#isolation').textContent=result.join(' / ');
 fetch('/api/human/invoke',{method:'POST',body:'{}'}).then(()=>document.body.dataset.network='exposed').catch(()=>document.body.dataset.network='blocked');
 parent.postMessage({type:'complete',score:100,passed:true},'*');
 </script></body></html>`);
  for (const [id, kind, name, mime, buffer] of [
    ["media-audio", "audio", "original.wav", "audio/wav", wav],
    ["media-video", "video", "original.mp4", "video/mp4", mp4],
    ["media-pdf", "document", "original.pdf", "application/pdf", pdf],
    ["media-interactive", "interactive", "practice.html", "text/html", html],
  ] as const) {
    await library
      .getByRole("button", { name: "New item", exact: true })
      .click();
    await library.getByLabel("Item ID", { exact: true }).fill(id);
    await library.getByLabel("Item title", { exact: true }).fill(id);
    await library
      .getByLabel("Item summary", { exact: true })
      .fill("Original browser fixture");
    await library
      .getByLabel("Item text", { exact: true })
      .fill("Human reads the original");
    await library
      .getByRole("combobox", { name: "Item format", exact: true })
      .selectOption(kind);
    if (kind !== "document")
      await library
        .getByLabel("Item transcript", { exact: true })
        .fill("Accessible description of the original practice");
    await library
      .getByLabel("I own this content and may upload it", { exact: true })
      .check();
    await library
      .getByLabel("Content file", { exact: true })
      .setInputFiles({ name, mimeType: mime, buffer });
    await expect(library.getByRole("status")).toContainText("Stored ");
    await library
      .getByRole("button", { name: "Save item draft", exact: true })
      .click();
    const row = library
      .locator(".learning-row")
      .filter({ has: page.getByRole("heading", { name: id, exact: true }) });
    await expect(row).toBeVisible();
    await row
      .getByRole("button", { name: "Publish item", exact: true })
      .click();
    await expect(row).toContainText("Published version 1");
  }
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, "learner-a");
  for (const id of [
    "media-audio",
    "media-video",
    "media-pdf",
    "media-interactive",
  ]) {
    const row = page
      .locator(".learning-row")
      .filter({ has: page.getByRole("heading", { name: id, exact: true }) });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: /Read/ }).click();
    const reader = page.getByRole("region", { name: "Standalone item reader" });
    if (id === "media-audio") {
      const audio = reader.locator("audio");
      await expect(audio).toHaveAttribute("src", /^blob:/);
      await expect
        .poll(() => audio.evaluate((el: HTMLAudioElement) => el.readyState))
        .toBeGreaterThan(0);
    }
    if (id === "media-video") {
      const video = reader.locator("video");
      await expect(video).toHaveAttribute("src", /^blob:/);
      await expect
        .poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState))
        .toBeGreaterThan(0);
    }
    if (id === "media-pdf") {
      const download = page.waitForEvent("download");
      await reader.getByRole("link", { name: "Download document" }).click();
      expect((await download).suggestedFilename()).toBe("media-pdf.pdf");
    }
    if (id === "media-interactive") {
      const readRevision = () =>
        page.evaluate(async () => {
          const s = await (await fetch("/api/session")).json();
          return (
            await (
              await fetch("/api/context", {
                headers: { "X-Pear-Epoch": s.sessionEpoch },
              })
            ).json()
          ).revision;
        });
      const revision = await readRevision();

      const frame = reader.frameLocator("iframe");
      await expect(frame.locator("#isolation")).toHaveText(
        "DOM blocked / Bridge blocked / cookie blocked / storage blocked",
      );
      await expect(frame.locator("body")).toHaveAttribute(
        "data-network",
        "blocked",
      );
      await frame
        .getByRole("button", { name: "Practice", exact: true })
        .click();
      await expect(
        frame.getByRole("button", { name: "Practiced", exact: true }),
      ).toBeVisible();
      await expect(reader).toContainText("No course progress or certificate");
      expect(await readRevision()).toBe(revision);
      await page.screenshot({
        path: "artifacts/media-sandbox.png",
        fullPage: true,
      });
    }
    await reader
      .getByRole("button", { name: "Close item", exact: true })
      .click();
  }
});
