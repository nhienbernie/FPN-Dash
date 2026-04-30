import { defineConfig, devices } from "@playwright/test";

const WEB_PORT = Number(process.env.PLAYWRIGHT_WEB_PORT || 19006);
const API_PORT = Number(process.env.PLAYWRIGHT_API_PORT || 4000);
const managedBaseURL = `http://127.0.0.1:${WEB_PORT}`;
const baseURL = process.env.PLAYWRIGHT_BASE_URL || managedBaseURL;
const shouldManageServers = !process.env.PLAYWRIGHT_BASE_URL;
const slowMo = Number(process.env.PLAYWRIGHT_SLOW_MO || 0);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: {
    timeout: 20_000,
  },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    ...devices["Desktop Chrome"],
    channel: "chrome",
    baseURL,
    launchOptions: slowMo > 0 ? { slowMo } : undefined,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: shouldManageServers
    ? [
        {
          command: "npm run server",
          url: `http://127.0.0.1:${API_PORT}/api/health`,
          timeout: 120_000,
          reuseExistingServer: !process.env.CI,
        },
        {
          command: "npm run web:e2e",
          url: managedBaseURL,
          timeout: 180_000,
          reuseExistingServer: !process.env.CI,
          env: {
            ...process.env,
            PLAYWRIGHT_WEB_PORT: String(WEB_PORT),
            EXPO_PUBLIC_DEMO_API_URL: `http://127.0.0.1:${API_PORT}`,
          },
        },
      ]
    : undefined,
});
