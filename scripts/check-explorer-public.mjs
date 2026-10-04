// Read-only smoke check. No report, reward, photo, profile or account writes.
import assert from 'node:assert/strict';
import { chromium, expect as baseExpect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const base = 'https://miastowzasiegu.pl';
const expect = baseExpect.configure({ timeout: 30000 });
const publication = JSON.parse(readFileSync('artifacts/iskry-explorer/publication.json', 'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const gameHtml = await fetch(base + '/gra');
assert.equal(gameHtml.status, 200);
assert.equal(digest(Buffer.from(await gameHtml.arrayBuffer())), publication.gameIndex);
const reportCount = async () => (await (await fetch(base + '/api/reports')).json()).reports.length;
const before = await reportCount();
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader'] });
const errors = [], writes = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  page.setDefaultTimeout(30000);
  await page.route('**/api/**', route => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) { writes.push(new URL(route.request().url()).pathname); return route.abort(); }
    return route.continue();
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/gra');
  await expect(page.getByRole('heading', { name: 'Zostaw po sobie dobry ślad.' })).toBeVisible();
  await expect(page.locator('.ex-mission')).toHaveCount(6);
  await expect(page.getByRole('button', { name: 'Przybliż mapę', exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/iskry-explorer/public-desktop.png' });
  await page.getByRole('searchbox', { name: 'Szukaj miejsca misji' }).fill('zxqaudit987');
  await expect(page.locator('.ex-mission-status')).toContainText('Brak misji');
  await page.getByRole('searchbox', { name: 'Szukaj miejsca misji' }).fill('');
  await expect(page.locator('.ex-mission')).toHaveCount(6);
  await page.locator('.ex-mission').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.ex-mission').first()).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Kolekcja odznak', exact: true }).click();
  await expect(page.locator('.ex-badge-tile')).toHaveCount(6);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: 'artifacts/iskry-explorer/public-collection-mobile.png', fullPage: true });
  await page.goto(base + '/gra?tryb=ogrod');
  await expect(page.getByRole('button', { name: 'Trening', exact: true })).toBeVisible();
  assert.equal(await reportCount(), before);
  assert.deepEqual(writes, []); assert.deepEqual(errors, []);
  publication.status = 'deployed-and-read-only-verified'; publication.verifiedAt = new Date().toISOString();
  publication.browser = { desktop: true, mobile: true, keyboard: true, emptySearchStatus: true, legacyTraining: true, writes, errors };
  writeFileSync('artifacts/iskry-explorer/publication.json', JSON.stringify(publication, null, 2));
  console.log(JSON.stringify(publication.browser));
} finally { await browser.close(); }
