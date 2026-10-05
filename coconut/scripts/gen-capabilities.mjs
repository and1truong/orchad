import { readFileSync, writeFileSync } from "node:fs";
const origin = readFileSync(
  new URL("../trusted-origin.txt", import.meta.url),
  "utf8",
).trim();
if (!/^https?:\/\/[^\s/]+$/.test(origin))
  throw new Error(`Invalid trusted origin: ${origin}`);
const capability = {
  identifier: "guest-replies",
  description:
    "Only correlated bridge replies; no privileged guest commands",
  webviews: ["guest"],
  local: false,
  remote: { urls: [`${origin}/*`] },
  permissions: ["allow-guest-reply"],
};
writeFileSync(
  new URL("../src-tauri/capabilities/guest-replies.json", import.meta.url),
  JSON.stringify(capability),
);
console.log(`guest-replies.json -> ${origin}/*`);
