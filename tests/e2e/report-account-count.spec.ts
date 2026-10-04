import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';

const password = 'Isolated-report-counter-test-2026!';
let accounts: { id: string; email: string }[] = [];
const card = (page: Page) => page.locator('.contribution-card');

test.beforeAll(async ({}, info) => {
  const api = await request.newContext({ baseURL: info.project.use.baseURL });
  try {
    expect((await (await api.get('/api/test-environment')).json()).isolated).toBe(true);
    for (let index = 0; index < 3; index++) {
      const email = `report-counter-${Date.now()}-${index}@example.invalid`;
      const response = await api.post('/api/auth/register', {
        data: { email, password, displayName: `Test licznika ${index}` },
      });
      expect(response.status()).toBe(201);
      const account = (await response.json()).user;
      accounts.push({ id: account.id, email });
      for (let report = 0; report < 2 - index; report++) {
        const saved = await api.post('/api/reports', { data: {
          expectedUserId: account.id, kind: 'obstacle', coordinates: [19.9415, 50.0647],
          description: `Dane testowe w odizolowanej bazie: ${index}, ${report}.`,
        } });
        expect(saved.status()).toBe(201);
        if (report === 1) {
          const id = (await saved.json()).id;
          expect((await api.post(`/api/reports/${id}/resolve`, {
            data: { expectedUserId: account.id },
          })).ok()).toBe(true);
        }
      }
    }
    await api.post('/api/auth/logout', { data: { expectedUserId: accounts[2].id } });
    expect((await api.post('/api/reports', { data: {
      expectedUserId: null, kind: 'obstacle', coordinates: [19.9415, 50.0647],
      description: 'Dane testowe: anonimowa obserwacja w odizolowanej bazie.',
    } })).status()).toBe(201);
  } finally { await api.dispose(); }
});

async function login(api: APIRequestContext, index: number) {
  const result = await api.post('/api/auth/login', { data: { email: accounts[index].email, password } });
  expect(result.status()).toBe(200);
}

async function prepare(page: Page, legacyCount = 0) {
  await page.addInitScript((count) => {
    localStorage.setItem('przejscie-onboarding', JSON.stringify('skipped'));
    localStorage.setItem('przejscie-contributions', JSON.stringify(Array.from({ length: count }, (_, i) => `legacy-${i}`)));
  }, legacyCount);
  await page.goto('/app?obserwacje=');
}

test('the same account has all its reports on fresh desktop and mobile devices', async ({ browser }, info) => {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: { width, height: 900 } });
    try {
      await login(context.request, 0);
      const page = await context.newPage();
      await prepare(page, width === 390 ? 37 : 0);
      await expect(card(page).locator('strong')).toHaveText('2');
      await expect(card(page)).toContainText('Twoje obserwacje zapisane na koncie');
      await expect(card(page)).toContainText('także na innym urządzeniu');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await card(page).screenshot({ path: `artifacts/report-account/account-${width}.png` });
    } finally { await context.close(); }
  }
});

test('guests see no invented local count, and anonymous reports are not claimed on login', async ({ page }) => {
  await prepare(page, 37);
  await expect(card(page)).toContainText('nie są przypisane do konta');
  await expect(card(page).locator('strong')).toHaveCount(0);
  await expect(card(page).getByRole('button', { name: 'Zaloguj się', exact: true })).toBeVisible();
  await login(page.request, 2);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(card(page).locator('strong')).toHaveText('0');
});

test('a delayed response from the previous account cannot replace the current count', async ({ page }) => {
  await login(page.request, 0);
  await prepare(page);
  await expect(card(page).locator('strong')).toHaveText('2');
  let release!: () => void;
  let captured!: () => void;
  let hold = true;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { captured = resolve; });
  await page.route('**/api/reports', async route => {
    if (!hold) return route.continue();
    const response = await route.fetch();
    captured();
    await gate;
    await route.fulfill({ response });
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await started;
  hold = false;
  await login(page.request, 1);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(card(page).locator('strong')).toHaveText('1');
  const delivered = page.waitForResponse(async response => response.url().endsWith('/api/reports')
    && (await response.json()).reports.filter((report: { isMine: boolean }) => report.isMine).length === 2);
  release();
  await delivered;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(card(page).locator('strong')).toHaveText('1');
});

test('a failed fetch shows an error instead of zero and can recover', async ({ page }) => {
  await login(page.request, 0);
  let fail = true;
  await page.route('**/api/reports', route => fail
    ? route.fulfill({ status: 503, json: { error: { message: 'Testowa niedostępność.' } } })
    : route.continue());
  await prepare(page);
  await expect(card(page)).toContainText('Nie udało się pobrać liczby obserwacji.');
  await expect(card(page).locator('strong')).toHaveCount(0);
  fail = false;
  await card(page).getByRole('button', { name: 'Spróbuj ponownie' }).click();
  await expect(card(page).locator('strong')).toHaveText('2');
});
