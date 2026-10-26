import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT ?? 3000);
const devPort = Number(process.env.DEV_PORT ?? port + 1);
const baseURL = `http://localhost:${port}`;
const devBaseURL = `http://localhost:${devPort}`;

// Optional: point Chromium at a preinstalled browser binary when the
// environment cannot download Playwright's own (for example a sandbox).
// CI installs browsers with `playwright install` and leaves this unset.
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const chromium = {
  ...devices["Desktop Chrome"],
  ...(chromiumExecutable ? { launchOptions: { executablePath: chromiumExecutable } } : {}),
};
const withWebKit = Boolean(process.env.CI) || process.env.PLAYWRIGHT_WEBKIT === "1";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { trace: "retain-on-failure" },
  projects: [
    // Production build: the pages members will see.
    { name: "chromium", testIgnore: /\.dev\.spec\.ts$/, use: { ...chromium, baseURL } },
    // Development server: the /dev/ui gallery exists only in development.
    { name: "chromium-dev", testMatch: /\.dev\.spec\.ts$/, use: { ...chromium, baseURL: devBaseURL } },
    ...(withWebKit
      ? [
          { name: "webkit", testIgnore: /\.dev\.spec\.ts$/, use: { ...devices["Desktop Safari"], baseURL } },
          { name: "webkit-dev", testMatch: /\.dev\.spec\.ts$/, use: { ...devices["Desktop Safari"], baseURL: devBaseURL } },
        ]
      : []),
  ],
  webServer: [
    {
      command: `pnpm start --port ${port}`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `pnpm dev --port ${devPort}`,
      url: `${devBaseURL}/dev/ui`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
