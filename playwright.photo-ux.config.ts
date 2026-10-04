import { defineConfig } from '@playwright/test';
import base from './playwright.photo.config';

export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: process.env.PHOTO_UX_URL || 'http://127.0.0.1:4195' },
  webServer: undefined,
  reporter: [['list'], ['json', { outputFile: 'artifacts/report-photo/ux-browser-results.json' }]],
  outputDir: 'artifacts/report-photo/ux-browser',
});
