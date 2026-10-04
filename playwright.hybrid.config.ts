import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/hybrid', workers: 1, timeout: 90_000,
  use: { baseURL: 'http://127.0.0.1:45783', viewport: { width: 390, height: 844 }, headless: true,
    launchOptions: { args: ['--use-angle=swiftshader'] }, screenshot: 'only-on-failure' },
  outputDir: 'artifacts/hybrid/browser-results', reporter: [['list'], ['json', { outputFile: 'artifacts/hybrid/browser-results.json' }]],
});
