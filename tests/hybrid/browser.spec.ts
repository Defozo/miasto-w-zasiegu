import { test, expect, type Page } from '@playwright/test';

async function native(page: Page, ready = false) {
  await page.addInitScript(({ ready }) => {
    const messages: { method: string; params: unknown }[] = [];
    Object.assign(window, { nativeTestMessages: messages, MiastoNative: {
      onmessage: null,
      postMessage(data: string) {
        const message = JSON.parse(data); messages.push(message);
        const result = message.method === 'auth.status' ? { ready, userId: null } : message.method === 'auth.token' ? null : true;
        queueMicrotask(() => window.MiastoNative?.onmessage?.({ data: JSON.stringify({ id: message.id, result }) }));
      },
    } });
  }, { ready });
}
async function open(page: Page) {
  await page.goto('/app');
  await page.getByRole('button', { name: 'Pomiń na razie', exact: true }).click();
  const tutorial = page.getByRole('button', { name: 'Pomiń tutorial' });
  if (await tutorial.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) await tutorial.click();
  await expect(page.getByRole('combobox', { name: 'Miejsce lub adres', exact: true })).toBeVisible();
}
async function address(page: Page, label: string, query: string, option: RegExp) {
  await page.getByRole('combobox', { name: label, exact: true }).fill(query);
  await page.getByRole('listbox', { name: `Podpowiedzi: ${label}` }).getByRole('option', { name: option }).first().click();
}

test('shared mobile UI plans a real route and hands its geometry and needs to Android', async ({ page }) => {
  await native(page); await open(page);
  await address(page, 'Miejsce lub adres', 'Rynek Główny 1', /Rynek/);
  await page.getByRole('button', { name: 'Nawiguj', exact: true }).click();
  await address(page, 'Skąd', 'Długa 12', /Długa/);
  await page.getByRole('button', { name: 'Wyznacz trasę', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Rozpocznij prowadzenie', exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText('GPS i polskie instrukcje głosowe mogą działać również przy zablokowanym ekranie.')).toBeVisible();
  await page.getByRole('button', { name: 'Rozpocznij prowadzenie', exact: true }).click();
  const message = await page.evaluate(() => (window as unknown as { nativeTestMessages: { method: string; params: any }[] }).nativeTestMessages.find(m => m.method === 'guidance.prepare'));
  expect(message?.params.route.geometry.coordinates.length).toBeGreaterThan(2);
  expect(message?.params.route.steps.length).toBeGreaterThan(1);
  expect(message?.params.profile.mobility).toBe('walking');
  expect(message?.params.profile.widthCm).toBe('');
  const count = await page.evaluate(() => (window as unknown as { nativeTestMessages: unknown[] }).nativeTestMessages.length);
  await page.getByRole('combobox', { name: 'Skąd', exact: true }).fill('inna ulica');
  expect(await page.evaluate(count => (window as unknown as { nativeTestMessages: { method: string }[] }).nativeTestMessages.slice(count).some(m => m.method === 'guidance.invalidate'), count)).toBe(true);
});

test('native login uses the system flow and preserves the return destination', async ({ page }) => {
  await native(page, true); await page.goto('/sign-in?return_to=/cennik');
  await expect(page.getByText('Kontynuuj w przeglądarce systemowej. Po zalogowaniu wrócisz do aplikacji.')).toBeVisible();
  await page.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
  await expect(page).toHaveURL(/\/cennik$/);
});

test('ordinary browser still uses the existing web experience', async ({ page }) => {
  await open(page);
  expect(await page.evaluate(() => typeof window.MiastoNative)).toBe('undefined');
  await expect(page.getByRole('button', { name: 'Profil', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('invalid width remains visible and editable on a small mobile screen', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Profil', exact: true }).click();
  await page.getByRole('button', { name: 'Dodaj zestaw', exact: true }).click();
  await page.getByRole('radio', { name: 'Wózek manualny', exact: true }).check();
  await page.getByRole('button', { name: 'Dalej', exact: true }).click();
  await page.getByRole('button', { name: 'Wpisz parametry', exact: true }).click();
  await page.getByLabel('Nazwa zestawu', { exact: true }).fill('Test widoczności błędu');
  const width = page.getByRole('spinbutton', { name: /Szerokość całkowita/ });
  await width.fill('5');
  await page.getByRole('button', { name: 'Zastosuj i pokaż mapę', exact: true }).click();
  const error = page.getByRole('alert').filter({ hasText: 'Podaj szerokość od 30 do 200 cm' });
  await expect(error).toBeInViewport({ ratio: 1 });
  await expect(width).toBeFocused();
  await expect(width).toHaveValue('5');
  await expect(width).toHaveAttribute('aria-invalid', 'true');
  const errorId = await error.getAttribute('id');
  expect((await width.getAttribute('aria-describedby'))?.split(' ')).toContain(errorId);
  await page.screenshot({ path: 'artifacts/hybrid/ux-audit/width-error-mobile.png' });
  await width.fill('70');
  await page.getByRole('button', { name: 'Zastosuj i pokaż mapę', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Zapisano zestaw potrzeb' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
