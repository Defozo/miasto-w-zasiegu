import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('unconfigured account has an accessible state and no local password form', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/app?konto=1');
  await expect(page.getByRole('heading', { name: 'Twoje konto.' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Logowanie jest obecnie niedostępne' })).toBeVisible();
  await expect(page.locator('input[type=password]')).toHaveCount(0);
  expect((await new AxeBuilder({ page }).include('.account-panel').analyze()).violations).toEqual([]);
  await page.screenshot({ path: 'artifacts/auth-mobile-account.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('sign-in, sign-up and callback paths retain keyboard access to guest mode', async ({ page }) => {
  for (const [path, title] of [['/sign-in', 'Zaloguj się'], ['/sign-up', 'Utwórz konto'], ['/sign-in/sso-callback', 'Zaloguj się']]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    const guest = page.getByRole('link', { name: 'Korzystaj bez konta' });
    await guest.focus(); await expect(guest).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Dokąd ruszamy?', exact: true })).toBeVisible();
  }
});

test('failed config request keeps public app usable', async ({ page }) => {
  await page.route('**/api/auth/config', route => route.abort('failed'));
  await page.goto('/app?konto=1');
  await expect(page.getByText('Logowanie jest obecnie niedostępne.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Twoja trasa', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dokąd ruszamy?', exact: true })).toBeVisible();
});

test('transport requests a fresh token and does not send a write if token acquisition fails', async ({ page }) => {
  const sent: string[] = [];
  await page.route('**/api/auth-probe', async route => {
    sent.push(route.request().headers()['authorization'] ?? '');
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto('/app?konto=1');
  await expect(page.getByRole('heading', { name: 'Twoje konto.' })).toBeVisible();
  const error = await page.evaluate(async () => {
    const sessionModule = '/src/auth/session.ts', apiModule = '/src/api.ts';
    const { connectAuth } = await import(sessionModule);
    const { api } = await import(apiModule);
    let issued = 0;
    const disconnect = connectAuth(async () => {
      if (++issued === 3) throw new Error('Fixture token refresh failed');
      return `fixture-token-${issued}`;
    }, async () => {});
    try {
      await api('/auth-probe', { fixture: true });
      await api('/auth-probe', { fixture: true });
      try { await api('/auth-probe', { fixture: true }); }
      catch (cause) { return (cause as Error).message; }
    } finally { disconnect(); }
    return '';
  });
  expect(sent).toEqual(['Bearer fixture-token-1', 'Bearer fixture-token-2']);
  expect(error).toBe('Fixture token refresh failed');
});

test('logout reports server revocation failure instead of pretending to sign out', async ({ page }) => {
  let fail = true;
  await page.route('**/api/auth/logout', route => route.fulfill({ status: fail ? 503 : 200,
    json: fail ? { error: { message: 'Fixture revocation failed' } } : { ok: true } }));
  await page.goto('/sign-in');
  await expect(page.getByRole('heading', { name: 'Zaloguj się', exact: true })).toBeVisible();
  const first = await page.evaluate(async () => {
    const sessionModule = '/src/auth/session.ts', apiModule = '/src/api.ts';
    const { connectAuth } = await import(sessionModule);
    const { logoutAccount } = await import(apiModule);
    let signedOut = false;
    const disconnect = connectAuth(async () => 'fixture', async () => { signedOut = true; });
    try { await logoutAccount('fixture'); return { signedOut, message: '' }; }
    catch (cause) { return { signedOut, message: (cause as Error).message }; }
    finally { disconnect(); }
  });
  expect(first).toEqual({ signedOut: false, message: 'Fixture revocation failed' });
  fail = false;
  expect(await page.evaluate(async () => {
    const sessionModule = '/src/auth/session.ts', apiModule = '/src/api.ts';
    const { connectAuth } = await import(sessionModule);
    const { logoutAccount } = await import(apiModule);
    let signedOut = false;
    const disconnect = connectAuth(async () => 'fixture', async () => { signedOut = true; });
    try { await logoutAccount('fixture'); return signedOut; } finally { disconnect(); }
  })).toBe(true);
});
