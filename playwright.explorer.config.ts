import { defineConfig } from '@playwright/test';
import base from './playwright.config';
const webPort = Number(process.env.EXPLORER_E2E_WEB_PORT || 4197);
const apiPort = Number(process.env.EXPLORER_E2E_API_PORT || 3097);
export default defineConfig({ ...base,
  testMatch: '**/{explorer,game,game-album,report-photo}.spec.ts',
  use: { ...base.use, baseURL: `http://127.0.0.1:${webPort}`, serviceWorkers: 'block' },
  reporter: [['list'], ['json', { outputFile: 'artifacts/iskry-explorer/browser-results.json' }]],
  outputDir: 'artifacts/iskry-explorer/test-results',
  webServer: [
    { command: 'node scripts/e2e-api.mjs', url: `http://127.0.0.1:${apiPort}/api/health`, env: { PORT: String(apiPort), PRZEJSCIE_SKIP_DEFAULT_APP: '1' }, timeout: 90000, reuseExistingServer: process.env.E2E_REUSE_SERVER === '1' },
    { command: `node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${webPort} --outDir ../artifacts/iskry-explorer/release-dist`, url: `http://127.0.0.1:${webPort}`, env: { API_TARGET: `http://127.0.0.1:${apiPort}` }, timeout: 90000, reuseExistingServer: process.env.E2E_REUSE_SERVER === '1' },
  ],
});
