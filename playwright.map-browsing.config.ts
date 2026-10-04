import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: 'http://127.0.0.1:4187' },
  reporter: [['list'], ['json', { outputFile: 'artifacts/map-browsing/results.json' }]],
  outputDir: 'artifacts/map-browsing/browser',
  webServer: [
    { command: 'node scripts/e2e-api.mjs', url: 'http://127.0.0.1:3093/api/test-environment', env: { PORT: '3093' }, timeout: 90000 },
    { command: 'npx vite preview --host 127.0.0.1 --port 4187 --outDir ../artifacts/map-browsing-dist', url: 'http://127.0.0.1:4187', env: { API_TARGET: 'http://127.0.0.1:3093' }, timeout: 90000 },
  ],
});
