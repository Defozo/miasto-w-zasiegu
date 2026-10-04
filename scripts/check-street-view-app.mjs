// Check the prepared UI with a real route and Google panorama. No reports are written.
// By default only this isolated browser sees local build assets at the app origin.
import { chromium, expect } from '@playwright/test';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, sep, extname } from 'node:path';

const origin = 'https://miastowzasiegu.pl';
const published = process.argv.includes('--published');
const dist = resolve('artifacts/street-view/dist');
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader'] });
mkdirSync('artifacts/street-view', { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  if (!published) await page.route(origin + '/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/')) return route.continue();
    const file = resolve(dist, url.pathname === '/app' || url.pathname === '/' ? 'index.html' : '.' + url.pathname);
    if (!file.startsWith(dist + sep) || !existsSync(file)) return route.continue();
    const contentType = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2' }[extname(file)] || 'application/octet-stream';
    return route.fulfill({ contentType, body: readFileSync(file) });
  });
  await page.goto(origin + '/app');
  await page.getByRole('button', { name: 'Pomiń na razie', exact: true }).click();
  await page.getByRole('button', { name: /^Klub Pod Jaszczurami/ }).click();
  await page.getByRole('button', { name: 'Nawiguj', exact: true }).click();
  async function address(label, query) {
    await page.getByRole('combobox', { name: label, exact: true }).fill(query);
    await page.getByRole('listbox', { name: `Podpowiedzi: ${label}` }).getByRole('option').first().click();
  }
  await address('Skąd', 'Długa 12');
  await address('Dokąd', 'Rynek Główny 1');
  await page.getByRole('button', { name: 'Wyznacz trasę', exact: true }).click();
  const turn = page.locator('.route-steps > li').filter({ hasText: /skręć|skręt|w lewo|w prawo/i }).first();
  await turn.waitFor({ state: 'visible', timeout: 40000 });
  const instruction = await turn.locator('.route-step-body > p').first().innerText();
  await turn.getByRole('button', { name: /Pokaż Street View/ }).click();
  const iframe = turn.locator('iframe');
  await expect(iframe).toBeVisible();
  const frame = iframe.contentFrame();
  await frame.locator('canvas').first().waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(4000);
  const url = new URL(await iframe.getAttribute('src'));
  const result = { checkedAt: new Date().toISOString(), scope: published ? 'Published app' : 'Prepared build only in isolated browser; live routing and Google iframe',
    instruction, steps: await page.locator('.route-steps > li').count(), point: url.searchParams.get('location'), heading: url.searchParams.get('heading'),
    frameText: (await frame.locator('body').innerText()).slice(0, 1200), testedWidths: [1440, 390] };
  await turn.screenshot({ path: 'artifacts/street-view/real-route-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  const list = page.getByRole('button', { name: 'Pokaż listę', exact: true });
  if (await list.isVisible()) await list.click();
  await turn.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  await turn.screenshot({ path: 'artifacts/street-view/real-route-mobile.png' });
  writeFileSync('artifacts/street-view/real-route-verification.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally { await browser.close(); }
