import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testMatch: '**/report-account-count.spec.ts',
  use: { ...base.use, baseURL: 'http://127.0.0.1:4197' },
  webServer: {
    command: 'node scripts/report-photo-ux-preview.mjs',
    url: 'http://127.0.0.1:4197/api/test-environment',
    env: {
      PRZEJSCIE_SKIP_DEFAULT_APP: '1',
      UX_PREVIEW_PORT: '4197',
      UX_PREVIEW_DIST: 'artifacts/report-account-release-dist',
    },
    timeout: 30000,
  },
  reporter: [['list'], ['json', { outputFile: 'artifacts/report-account/browser-results.json' }]],
  outputDir: 'artifacts/report-account/browser',
});
