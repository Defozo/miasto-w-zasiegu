// Read-only check: render a real Kraków panorama under the configured app origin.
// The preview page exists only inside this isolated browser, not on the public site.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const origin = 'https://miastowzasiegu.pl';
const configuration = await (await fetch(origin + '/api/integrations/maps')).json();
const key = configuration.googlePlacesUi?.browserKey;
if (!key) throw new Error('The public API has no browser key configured.');
const params = new URLSearchParams({ key, location: '50.06143,19.937191', heading: '90', pitch: '0', fov: '80', language: 'pl', region: 'PL' });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader'] });
mkdirSync('artifacts/street-view', { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 1000, height: 720 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  let embedStatus = null;
  let imageResponses = 0;
  page.on('response', response => {
    if (response.url().startsWith('https://www.google.com/maps/embed/v1/streetview')) embedStatus = response.status();
    if (/streetviewpixels.*tile|googleusercontent.com.*tile|cbk.*output=tile/.test(response.url()) && response.ok()) imageResponses++;
  });
  await page.route(origin + '/__street-view-check', route => route.fulfill({ contentType: 'text/html', body:
    `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Sprawdzenie Street View</title></head><body style="font:16px system-ui;margin:24px"><h1>Podgląd Street View: Rynek Główny</h1><p>Kontrola integracji, strona testowa tylko w tej przeglądarce.</p><iframe title="Street View przy Rynku Głównym" width="940" height="500" style="border:0" referrerpolicy="strict-origin-when-cross-origin" src="https://www.google.com/maps/embed/v1/streetview?${params}"></iframe></body></html>`
  }));
  await page.goto(origin + '/__street-view-check');
  const frame = page.frameLocator('iframe');
  await frame.locator('canvas').first().waitFor({ state: 'visible', timeout: 30000 });
  // The canvas is visible before its panorama tiles have arrived.
  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'artifacts/street-view/google-embed.png' });
  const visibleText = (await frame.locator('body').innerText()).replaceAll(key, '[redacted]').slice(0, 1500);
  const result = { checkedAt: new Date().toISOString(), scope: 'Real Google iframe in isolated browser preview on app origin; no public UI deployment', embedStatus, imageResponses, visibleText };
  writeFileSync('artifacts/street-view/google-embed-verification.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally { await browser.close(); }
