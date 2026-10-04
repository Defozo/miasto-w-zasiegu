import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '../e2e', testMatch: ['equipment-chat.spec.ts', 'redesign.spec.ts'],
  workers: 1, timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:4286', headless: true, serviceWorkers: 'block', viewport: { width: 1440, height: 1000 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  reporter: [['list']], outputDir: '../../artifacts/equipment-chat-tests',
  webServer: [
    { command: 'node scripts/e2e-api.mjs', cwd: '../..', url: 'http://127.0.0.1:3186/api/test-environment', timeout: 120000, env: { PORT: '3186' } },
    { command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4286', cwd: '../..', url: 'http://127.0.0.1:4286', timeout: 120000, env: { API_TARGET: 'http://127.0.0.1:3186' } },
  ],
});
