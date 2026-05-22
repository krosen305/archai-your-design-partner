import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: "test-results/artifacts",

  use: {
    baseURL: "http://127.0.0.1:8080",
    trace: "on-first-retry",
    // Gem screenshot ved fejl automatisk
    screenshot: "only-on-failure",
  },

  webServer: {
    command: process.env.CI
      ? "bun run build && bun run preview -- --host 127.0.0.1 --port 8080"
      : "bun run dev -- --host 127.0.0.1 --port 8080",
    url: "http://127.0.0.1:8080",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
  ],

  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
});
