import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  testIgnore: "**/production.spec.ts",
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:4310",
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
    command: "node --import tsx src/server/start.ts --dev",
    url: "http://127.0.0.1:4310/health",
    reuseExistingServer: false,
    env: {
      DATABASE_PATH: ".data/e2e-" + Date.now() + ".sqlite",
      APP_ORIGIN: "http://127.0.0.1:4310",
    },
    timeout: 30_000,
  },
});
