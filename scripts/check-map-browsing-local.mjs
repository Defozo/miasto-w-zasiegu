// Read-only verification against the local app; no fixture records or accounts.
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const placesResponse = page.waitForResponse(response => response.url().includes('/api/places?') && response.url().includes('includeMap=true'));
  await page.goto('http://127.0.0.1:5173/app');
  const skip = page.getByRole('button', { name: 'Pomiń na razie', exact: true });
  await skip.click();
  const data = await (await placesResponse).json();
  assert(data.mapPlaces.length > 1000);
  await page.locator('.map-section[data-map-ready="true"]').waitFor();
  const tour = page.getByRole('dialog', { name: 'Przewodnik po mapie', exact: true });
  if (await tour.isVisible()) await tour.getByRole('button', { name: 'Pomiń tutorial', exact: true }).click();
  await page.locator('.place-card').first().waitFor();
  await page.screenshot({ path: 'artifacts/map-browsing/local-real-data.png' });
  const name = await page.locator('.place-card .place-name').first().textContent();
  await page.locator('.place-card').first().click();
  const pin = page.locator('.place-pin.is-selected');
  await pin.waitFor();
  await page.waitForTimeout(800);
  const before = await pin.boundingBox();
  const canvas = await page.locator('.map-canvas').boundingBox();
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2 + 160);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width / 2 + 180, canvas.y + canvas.height / 2 + 160, { steps: 16 });
  await page.mouse.up();
  await page.waitForTimeout(1200);
  const after = await pin.boundingBox();
  assert(after.x - before.x > 120, 'The map must retain the user pan after selection.');
  const result = { url: page.url(), mapPlaces: data.mapPlaces.length, listPlaces: data.places.length, nextOffset: data.nextOffset, selectedPlace: name, panPixels: Math.round(after.x - before.x), checkedAt: new Date().toISOString() };
  await writeFile('artifacts/map-browsing/local-verification.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
