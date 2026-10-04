import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({
  ...base,
  testMatch: '**/report-photo.spec.ts',
  use: { ...base.use, baseURL: 'http://127.0.0.1:4176' },
  reporter: [['list'], ['json', { outputFile: 'artifacts/report-photo/browser-results.json' }]],
  outputDir: 'artifacts/report-photo/browser',
  webServer: [
    { command: 'node scripts/e2e-api.mjs', url: 'http://127.0.0.1:3095/api/health', env: { PORT: '3095' }, timeout: 90000 },
    { command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4176', url: 'http://127.0.0.1:4176', env: { API_TARGET: 'http://127.0.0.1:3095' }, timeout: 90000 },
  ],
});
