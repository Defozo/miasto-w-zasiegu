import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "street-view.spec.ts",
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:5183",
    headless: true,
    serviceWorkers: "block",
    viewport: { width: 1440, height: 1000 },
    launchOptions: { args: ["--use-angle=swiftshader"] },
    screenshot: "only-on-failure",
  },
  outputDir: "artifacts/street-view/test-results",
  reporter: [["list"]],
  webServer: [
    {
      command: "node scripts/e2e-api.mjs",
      url: "http://127.0.0.1:3093/api/test-environment",
      env: { PORT: "3093", PRZEJSCIE_SKIP_DEFAULT_APP: "1" },
      timeout: 60000,
    },
    {
      command: "npx vite --host 127.0.0.1 --port 5183",
      url: "http://127.0.0.1:5183",
      env: { API_TARGET: "http://127.0.0.1:3093" },
      timeout: 60000,
    },
  ],
});
