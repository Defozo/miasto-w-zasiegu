import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('przejscie-map-tutorial-v1', '"completed"'));
});

test('map search remains consistent after changing tabs and clearing a category shortcut', async ({ page }) => {
  await page.goto('/app');
  await page.getByRole('button', { name: 'Pomiń na razie', exact: true }).click();
  const search = page.getByRole('combobox', { name: 'Miejsce lub adres', exact: true });
  await search.fill('Wawel');
  await expect(page.locator('.place-card').first()).toContainText('Wawel');
  await page.getByRole('button', { name: 'Profil', exact: true }).click();
  await page.getByRole('button', { name: 'Mapa', exact: true }).click();
  await expect(search).toHaveValue('Wawel');
  await expect(page.getByRole('button', { name: 'Wyczyść: Miejsce lub adres' })).toBeVisible();
  const parkingRequest = page.waitForRequest(request => {
    const url = new URL(request.url());
    return url.pathname === '/api/places' && url.searchParams.get('placeType') === 'parking' && url.searchParams.get('q') === '';
  });
  await page.getByRole('button', { name: 'Parkingi', exact: true }).click();
  await parkingRequest;
  await expect(search).toHaveValue('');
  await search.fill('Wawel');
  await expect(search).toHaveValue('Wawel');
  await page.getByRole('button', { name: 'Wyczyść: Miejsce lub adres' }).click();
  await expect(search).toHaveValue('');
});

for (const width of [1440, 390, 320]) {
  test(`map outage message stays readable above the workspace at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route('https://tiles.openfreemap.org/**', route => route.abort());
    await page.goto('/app');
    await page.getByRole('button', { name: 'Pomiń na razie', exact: true }).click();
    const message = page.getByRole('status').filter({ hasText: 'Podkład mapy jest niedostępny.' });
    await expect(message).toBeVisible();
    const workspace = await page.locator('.workspace').boundingBox();
    const box = await message.boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(workspace!.y);
    expect(await message.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      return !!hit && element.contains(hit);
    })).toBe(true);
    await expect(page.getByRole('combobox', { name: 'Miejsce lub adres', exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`map-outage-${width}.png`) });
    await page.getByRole('button', { name: 'Profil', exact: true }).click();
    await expect(message).toHaveCount(0);
  });
}
