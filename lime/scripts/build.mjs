import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
await mkdir("dist/extension", { recursive: true });
await build({
  entryPoints: ["src/extension/sidepanel.tsx"],
  bundle: true,
  outdir: "dist/extension",
  format: "esm",
  target: "chrome120",
  jsx: "automatic",
});
await build({
  entryPoints: ["src/extension/worker.ts"],
  bundle: true,
  outfile: "dist/extension/worker.js",
  format: "esm",
  target: "chrome120",
});
await build({
  entryPoints: ["src/companion/cli.ts"],
  bundle: true,
  packages: "external",
  outfile: "dist/companion/cli.js",
  platform: "node",
  format: "esm",
  target: "node22",
});
await writeFile(
  "dist/extension/manifest.json",
  JSON.stringify(
    {
      manifest_version: 3,
      name: "Orchard Lime POC",
      version: "0.1.0",
      minimum_chrome_version: "120",
      permissions: ["activeTab", "scripting", "sidePanel"],
      optional_host_permissions: ["http://*/*", "https://*/*"],
      background: { service_worker: "worker.js", type: "module" },
      action: { default_title: "Open Lime" },
      side_panel: { default_path: "sidepanel.html" },
      content_security_policy: {
        extension_pages:
          "script-src 'self'; object-src 'self'; connect-src https: http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*",
      },
    },
    null,
    2,
  ),
);
await writeFile(
  "dist/extension/sidepanel.html",
  '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lime — Browser agent</title><link rel="stylesheet" href="sidepanel.css"></head><body><div id="root"></div><script type="module" src="sidepanel.js"></script></body></html>',
);
