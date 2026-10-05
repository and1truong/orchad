import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "production.spec.ts",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4315",
    viewport: { width: 1440, height: 960 },
    launchOptions: {
      ...(process.env.CHROMIUM_PATH
        ? { executablePath: process.env.CHROMIUM_PATH }
        : {}),
      args: ["--no-sandbox"],
    },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node --import tsx src/server/start.ts",
    url: "http://127.0.0.1:4315/health",
    reuseExistingServer: false,
    env: {
      PORT: "4315",
      DATABASE_PATH: ".data/production-e2e-" + Date.now() + ".sqlite",
      APP_ORIGIN: "http://127.0.0.1:4315",
    },
    timeout: 30_000,
  },
});
