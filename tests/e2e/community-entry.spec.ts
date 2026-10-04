import { test, expect } from '@playwright/test';

for (const width of [1440, 390]) {
  test(`landing observation link leads to an actionable form at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const writes: string[] = [];
    page.on('request', request => {
      if (request.method() !== 'GET' && /\/api\/(reports|billing)/.test(request.url())) writes.push(request.url());
    });
    await page.goto('/');
    const link = page.getByRole('link', { name: 'Dodaj swoją obserwację' });
    await link.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Pomiń na razie', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Dodaj obserwację' })).toBeVisible();
    await expect(page.getByText('Otwórz formularz „Dodaj obserwację”, wskaż miejsce na mapie lub z listy i opisz zauważone warunki.')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    const add = page.getByRole('button', { name: 'Dodaj obserwację', exact: true });
    await add.focus();
    await page.keyboard.press('Enter');
    const form = page.getByRole('dialog', { name: 'Co jest na drodze?' });
    await expect(form).toBeVisible();
    await expect(form.getByRole('button', { name: 'Wskaż na mapie', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(form).not.toBeVisible();
    await expect(add).toBeFocused();
    expect(writes).toEqual([]);
  });
}
