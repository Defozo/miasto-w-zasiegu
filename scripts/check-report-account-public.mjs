import { chromium, expect } from '@playwright/test';
import { readFile, readdir, writeFile } from 'node:fs/promises';

const base = 'https://miastowzasiegu.pl';
const expectedEntry = (await readFile('artifacts/report-account-release-dist/index.html', 'utf8')).match(/src="(\/assets\/index-[^"]+\.js)"/)[1];
const html = await (await fetch(`${base}/app?obserwacje=`)).text();
if (!html.includes(expectedEntry)) throw new Error('The public page does not use the tested release.');
const appChunk = (await readdir('artifacts/report-account-release-dist/assets')).find(file => /^App-.*\.js$/.test(file));
if (!appChunk) throw new Error('Missing application chunk.');
const bundle = await (await fetch(`${base}/assets/${appChunk}`)).text();
if (!bundle.includes('Twoje obserwacje zapisane na koncie') || bundle.includes('Twoich obserwacji na tym urządzeniu'))
  throw new Error('Unexpected counter copy in the public bundle.');
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader'] });
const checks = [];
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const blockedWrites = [];
    await page.route(`${base}/api/**`, route => {
      if (['GET', 'HEAD'].includes(route.request().method())) return route.continue();
      blockedWrites.push(route.request().url());
      return route.abort();
    });
    await page.addInitScript(() => localStorage.setItem('przejscie-onboarding', JSON.stringify('skipped')));
    await page.goto(`${base}/app?obserwacje=`);
    const card = page.locator('.contribution-card');
    await expect(card).toContainText('nie są przypisane do konta', { timeout: 45000 });
    await expect(card.locator('strong')).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'Zaloguj się', exact: true })).toBeVisible();
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Horizontal overflow');
    await card.screenshot({ path: `artifacts/report-account/public-guest-${width}.png` });
    if (blockedWrites.length) throw new Error('Unexpected API mutation during read-only verification.');
    checks.push({ width, guestCopy: 'verified', noDeviceCounter: true, noApiWrites: true });
    await context.close();
  }
} finally { await browser.close(); }
const result = { checkedAt: new Date().toISOString(), entry: expectedEntry, checks,
  accountVerification: 'Four local end-to-end tests with real isolated account/report APIs; no production test records.' };
await writeFile('artifacts/report-account/public-validation.json', JSON.stringify(result, null, 2));
const deployment = JSON.parse(await readFile('artifacts/report-account/deployment.json', 'utf8'));
await writeFile('artifacts/report-account/deployment.json', JSON.stringify({ ...deployment,
  status: 'deployed-and-verified', verification: 'artifacts/report-account/public-validation.json' }, null, 2));
console.log(JSON.stringify(result, null, 2));
