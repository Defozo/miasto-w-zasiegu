// Public smoke check with a public-domain reference photo. Never clicks the publish button.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
const base = 'https://miastowzasiegu.pl';
const config = await fetch(`${base}/api/report-photos/config`).then(response => response.json());
assert.equal(config.enabled, true);
const before = await fetch(`${base}/api/reports`).then(response => response.json());
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`${base}/app?obserwacje`);
  await page.getByRole('button', { name: /^(Pomiń na razie|Na razie pomiń)$/ }).click();
  await page.getByRole('button', { name: 'Dodaj obserwację', exact: true }).click();
  await page.getByLabel('Plik zdjęcia bariery', { exact: true }).setInputFiles('artifacts/report-photo/real-ramp.jpg');
  await page.getByRole('button', { name: 'Przeanalizuj zdjęcie', exact: true }).click();
  await page.getByRole('button', { name: 'Użyj tej propozycji' }).first().waitFor({ state: 'visible', timeout: 100000 });
  const resultText = await page.locator('.photo-result').innerText();
  await page.getByRole('button', { name: 'Użyj tej propozycji' }).first().click();
  const description = await page.getByLabel('Krótki opis').inputValue();
  assert(description.length > 3);
  assert.equal(await page.getByRole('dialog').getByRole('button', { name: 'Dodaj obserwację', exact: true }).isDisabled(), true);
  await page.locator('.report-photo').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/report-photo/public-photo-draft.png' });
  const after = await fetch(`${base}/api/reports`).then(response => response.json());
  const result = { checkedAt: new Date().toISOString(), base, config, resultText, description,
    reportCountBefore: before.reports.length, reportCountAfter: after.reports.length,
    publishedByThisCheck: 0, source: 'real-ramp-source.json', screenshot: 'public-photo-draft.png' };
  writeFileSync('artifacts/report-photo/public-validation.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
