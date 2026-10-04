import { test, expect } from '@playwright/test';

for (const width of [320, 390, 430]) {
  test(`mobile outage status and retry remain usable at ${width}px`, async ({ page, context }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    let failed = false;
    let requests = 0;
    await page.route('**/api/places?*', async route => {
      requests++;
      await route.fulfill(failed
        ? { status: 503, json: { error: { message: 'Brak połączenia z katalogiem miejsc. Spróbuj ponownie.' } } }
        : { json: { places: [], total: 0 } });
    });
    const response = await page.goto('/app');
    expect(response?.status()).toBe(200);
    await page.getByRole('button', { name: 'Pomiń na razie', exact: true }).click();
    const search = page.getByRole('combobox', { name: 'Miejsce lub adres', exact: true });
    const header = page.locator('.discover-header');
    const status = page.locator('.connection-banner').filter({ has: page.getByRole('button', { name: 'Ponów', exact: true }) });
    const retry = status.getByRole('button', { name: 'Ponów', exact: true });
    await expect(search).toBeVisible();
    await expect.poll(() => requests).toBeGreaterThan(0);
    await expect(page.locator('.loading-box')).toHaveCount(0);
    const originalTop = (await header.boundingBox())!.y;
    failed = true;
    await search.fill('Test');
    await expect(status).toContainText('Pokazujemy zapis miejsc');
    await page.keyboard.press('Escape');
    const assertClearStatus = async () => {
      const bannerBox = (await status.boundingBox())!;
      const headerBox = (await header.boundingBox())!;
      expect(bannerBox.y + bannerBox.height).toBeLessThanOrEqual(headerBox.y);
      const buttonBox = (await retry.boundingBox())!;
      expect(buttonBox.height).toBeGreaterThanOrEqual(48);
      expect(await retry.evaluate(button => {
        const rect = button.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return hit === button || button.contains(hit);
      })).toBe(true);
    };
    await assertClearStatus();
    await page.screenshot({ path: testInfo.outputPath('offline-map.png') });
    const beforeRetry = requests;
    await retry.click();
    await expect.poll(() => requests).toBeGreaterThan(beforeRetry);
    await assertClearStatus();
    failed = false;
    await search.focus();
    await page.keyboard.press('Shift+Tab');
    await expect(retry).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(status).toHaveCount(0);
    expect((await header.boundingBox())!.y).toBeCloseTo(originalTop, 0);
    await context.setOffline(true);
    await expect(status).toContainText('Jesteś offline');
    await assertClearStatus();
    await context.setOffline(false);
    await expect(status).toHaveCount(0);
    await expect(search).toBeVisible();
    await expect(search).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Profil', exact: true })).toBeVisible();
  });
}
