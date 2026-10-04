// Opt-in live configuration check. Never enters credentials or creates an account.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const base = new URL(process.argv[2] ?? 'http://127.0.0.1:5173');
const config = await fetch(new URL('/api/auth/config', base)).then(response => response.json());
assert.equal(config.provider, 'clerk');
assert.equal(config.configured, true, 'Start the API with Clerk keys from psst first.');
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pl-PL' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(new URL('/app?konto=1', base).href);
  const game = page.getByRole('link', { name: 'Otwórz Iskry Miasta' });
  await expect(game).toBeVisible();
  await game.focus();
  await expect(game).toBeFocused();
  await page.keyboard.press('Enter');
  await page.waitForURL(url => url.pathname === '/gra');
  await page.goto(new URL('/sign-in', base).href);
  await page.getByRole('button', { name: 'Kontynuuj z Google' }).waitFor();
  await expect(page.getByRole('textbox', { name: 'Adres e-mail', exact: true }))
    .toHaveAccessibleDescription('Przykładowy adres: nazwa@przyklad.pl');
  if (config.publishableKey.startsWith('pk_test_'))
    await expect(page.getByText('To wersja demonstracyjna. Konto tworzysz na potrzeby tej wersji aplikacji Miasto w zasięgu.')).toBeVisible();
  assert.equal(await page.locator('input[type=password]').count(), 0);
  const accessibility = await new AxeBuilder({ page }).include('.auth-page').analyze();
  await page.screenshot({ path: 'artifacts/auth-clerk-mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.getByRole('link', { name: 'Zarejestruj się', exact: true }).click();
  await page.waitForURL('**/sign-up');
  await page.getByRole('button', { name: 'Kontynuuj z Google' }).waitFor();
  await expect(page.getByRole('textbox', { name: 'Adres e-mail', exact: true }))
    .toHaveAccessibleDescription('Przykładowy adres: nazwa@przyklad.pl');
  assert.equal(await page.locator('input[type=password]').count(), 0);
  await page.screenshot({ path: 'artifacts/auth-clerk-sign-up-mobile.png', fullPage: true });
  // Inspect sign-up without initiating a new account or its anti-bot challenge.
  await page.goto(new URL('/sign-in', base).href);
  await page.getByRole('button', { name: 'Kontynuuj z Google' }).waitFor();
  await page.getByRole('button', { name: 'Kontynuuj z Google' }).click();
  await page.waitForURL(url => url.hostname === 'accounts.google.com', { timeout: 30000, waitUntil: 'domcontentloaded' });
  const oauth = new URL(page.url());
  console.log(JSON.stringify({ base: base.origin, mobileGuestGameLink: true, localizedEmailDescription: true, mobileSignIn: true, mobileSignUp: true,
    oauthDestination: oauth.origin + oauth.pathname, pageErrors: errors,
    axeViolations: accessibility.violations.map(({ id, impact, nodes }) => ({ id, impact, targets: nodes.map(node => node.target) })) }, null, 2));
  assert.deepEqual(errors, []);
  assert.deepEqual(accessibility.violations, []);
} finally { await browser.close(); }
