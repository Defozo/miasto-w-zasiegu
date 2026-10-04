import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: 'clerk.spec.ts', workers: 1, timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:5191', headless: true, viewport: { width: 390, height: 844 } },
  reporter: [['list']], outputDir: '../../artifacts/auth-ui-results',
  webServer: [
    { command: 'node tests/helpers/clerk-ui-server.mjs', cwd: '../..', url: 'http://127.0.0.1:3191/api/auth/config', reuseExistingServer: true },
    { command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5191 --strictPort', cwd: '../..',
      url: 'http://127.0.0.1:5191', reuseExistingServer: true, env: { API_TARGET: 'http://127.0.0.1:3191' } },
  ],
});
