// Browser smoke check. Every report/analysis write is blocked before reaching a server.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';

const base = process.env.PHOTO_NAV_URL || 'http://127.0.0.1:4195';
const before = await fetch(`${base}/api/reports`).then(response => response.json());
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader'] });
const checked = [], attemptedWrites = [];
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
    page.setDefaultTimeout(25000);
    await page.route('**/api/**', async route => {
      const request = route.request();
      if (request.method() !== 'GET' && /\/api\/(reports|observations|report-photos)(?:[/?]|$)/.test(request.url())) {
        attemptedWrites.push({ method: request.method(), url: request.url() });
        await route.abort();
      } else await route.continue();
    });
    await page.goto(`${base}/app?obserwacje`);
    await page.getByRole('button', { name: /^(Pomiń na razie|Na razie pomiń)$/ }).click();
    await page.getByRole('button', { name: 'Dodaj obserwację', exact: true }).click();
    const description = 'Sprawdzenie formularza bez publikacji.';
    await page.getByLabel('Krótki opis').fill(description);
    await page.getByRole('button', { name: 'Wskaż na mapie', exact: true }).click();
    const map = page.getByRole('region', { name: 'Mapa miejsc w Krakowie', exact: true });
    const back = page.getByRole('button', { name: 'Wróć do formularza', exact: true });
    await expect(map).toBeVisible();
    await expect(map).toHaveAttribute('data-map-ready', 'true');
    await expect(back).toBeFocused();
    await expect(page.locator('.toast')).toHaveCount(0);
    await expect(page.locator('.accessibility-map-panel')).toBeHidden();
    await page.screenshot({ path: `artifacts/report-photo/ux-navigation-${width}.png` });
    await back.click();
    await expect(page.getByLabel('Krótki opis')).toHaveValue(description);
    await page.getByRole('button', { name: 'Wskaż na mapie', exact: true }).click();
    await expect(back).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByLabel('Krótki opis')).toHaveValue(description);
    await page.getByRole('button', { name: 'Wskaż na mapie', exact: true }).click();
    await page.getByRole('button', { name: 'Profil', exact: true }).click();
    await expect(page.locator('.content-panel')).toBeVisible();
    await expect(page.locator('.app-shell')).not.toHaveClass(/report-picking/);
    await page.getByRole('button', { name: 'Wspólnie: obserwacje', exact: true }).click();
    await page.getByRole('button', { name: 'Dodaj obserwację', exact: true }).click();
    await expect(page.getByLabel('Krótki opis')).toHaveValue(description);
    await page.getByRole('button', { name: 'Zamknij zgłoszenie', exact: true }).click();
    checked.push({ width, mapVisible: true, pointerReturn: true, escapeReturn: true, tabNavigation: true, draftPreserved: true,
      entryAsset: await page.locator('script[type="module"][src]').first().getAttribute('src') });
    await page.close();
  }
  assert.equal(attemptedWrites.length, 0);
  const after = await fetch(`${base}/api/reports`).then(response => response.json());
  const result = { checkedAt: new Date().toISOString(), base, checked, attemptedWrites,
    reportsBefore: before.reports.length, reportsAfter: after.reports.length };
  writeFileSync('artifacts/report-photo/ux-navigation-validation.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally { await browser.close(); }
