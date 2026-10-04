import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:4174",
    // Feature suites start after the map introduction; map-tutorial.spec.ts tests first visits.
    storageState: {
      cookies: [],
      origins: [{
        origin: "http://127.0.0.1:4174",
        localStorage: [{ name: "przejscie-map-tutorial-v1", value: '"completed"' }],
      }],
    },
    headless: true,
    // Stable WebGL screenshots on Windows; the headless hardware path can leave stale rectangles.
    launchOptions: { args: ["--use-angle=swiftshader"] },
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  reporter: [
    ["list"],
    ["html", { outputFolder: "artifacts/playwright-report", open: "never" }],
  ],
  outputDir: "artifacts/test-results",
  webServer: [
    {
      command: "node scripts/e2e-api.mjs",
      url: "http://127.0.0.1:3082/api/health",
      reuseExistingServer: process.env.E2E_REUSE_SERVER === "1",
      timeout: 90000,
    },
    {
      command: "npx vite preview --host 127.0.0.1 --port 4174",
      url: "http://127.0.0.1:4174",
      reuseExistingServer: process.env.E2E_REUSE_SERVER === "1",
      timeout: 90000,
      env: { API_TARGET: "http://127.0.0.1:3082" },
    },
  ],
});
