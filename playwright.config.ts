import fs from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const HEADLESS_SHELL_PATH =
  "/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell";
const hasHeadlessShell = fs.existsSync(HEADLESS_SHELL_PATH);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

const chromiumMobileLaunchOptions = {
  ...(hasHeadlessShell ? { executablePath: HEADLESS_SHELL_PATH } : {}),
  args: [
    "--no-sandbox",
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
  ],
};

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
  },
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    {
      name: "iPhone 13",
      use: {
        ...devices["iPhone 13"],
        ...(hasHeadlessShell
          ? {
              defaultBrowserType: "chromium",
              launchOptions: chromiumMobileLaunchOptions,
            }
          : {}),
      },
    },
    {
      name: "Pixel 5",
      use: {
        ...devices["Pixel 5"],
        defaultBrowserType: "chromium",
        launchOptions: chromiumMobileLaunchOptions,
      },
    },
    {
      name: "iPad Mini",
      use: {
        ...devices["iPad Mini"],
        ...(hasHeadlessShell
          ? {
              defaultBrowserType: "chromium",
              launchOptions: chromiumMobileLaunchOptions,
            }
          : {}),
      },
    },
  ],
});
