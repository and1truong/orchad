import { defineConfig } from "@playwright/test";
const production = process.env.PEAR_E2E_PRODUCTION === "1";
export default defineConfig({
  testDir: "tests/e2e",
  testIgnore:
    process.env.PEAR_HOST_LANE === "1" ? undefined : "**/host.spec.ts",
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:4314",
    viewport: { width: 1440, height: 960 },
    launchOptions: {
      args: ["--no-sandbox"],
      ...(process.env.CHROMIUM_PATH
        ? { executablePath: process.env.CHROMIUM_PATH }
        : {}),
    },
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "node --import tsx src/server/start.ts" + (production ? "" : " --dev"),
    url: "http://127.0.0.1:4314/health",
    reuseExistingServer: false,
    env: {
      DATABASE_PATH: ".data/e2e-" + Date.now() + ".sqlite",
      APP_ORIGIN: "http://127.0.0.1:4314",
      PEAR_DEVELOPMENT_AUTH: "true",
    },
    timeout: 30_000,
  },
});
