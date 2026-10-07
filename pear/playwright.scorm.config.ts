import {defineConfig} from '@playwright/test';
// Each SCORM browser test owns its app and port; no shared development server.
export default defineConfig({
  testIgnore: process.env.PEAR_SCORM_HOST_LANE === '1' ? undefined : '**/*.host.spec.ts',
  testDir: 'tests/e2e', testMatch: 'scorm*.spec.ts', workers: 1, timeout: 60_000,
  use: {viewport: {width: 1440, height: 960}, trace: 'retain-on-failure',
    launchOptions: {args: ['--no-sandbox', '--disable-dev-shm-usage'],
      ...(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {})}},
});
