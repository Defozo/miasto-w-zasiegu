import { test, expect } from '@playwright/test';

for (const width of [1440, 390]) {
  test(`training success keeps keyboard focus in the next panel at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/gra?tryb=ogrod');
    await page.getByRole('button', { name: /02 Miara ma znaczenie/ }).click();
    await expect(page.getByRole('heading', { name: 'Miara ma znaczenie', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    const wrong = page.getByRole('button', { name: /Około jednego metra, na oko/ });
    await expect(wrong).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toContainText('Zapisz dokładny odczyt');
    await expect(wrong).toBeFocused();
    await expect(page.locator('.ig-garden-stats')).toContainText('0 iskier');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: /86 cm wolnego przejścia/ })).toBeFocused();
    await page.keyboard.press('Enter');
    const nextPanel = page.getByRole('heading', { name: 'Co tu posadzimy?', exact: true });
    await expect(nextPanel).toBeFocused();
    await expect(nextPanel).toBeInViewport();
    await expect(page.getByRole('status')).toContainText('+20 treningowych iskier');
    await page.keyboard.press('Tab');
    const flowers = page.getByRole('button', { name: 'Łąka iskier, 15 iskier, grządka 1', exact: true });
    await expect(flowers).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('.ig-garden-stats')).toContainText('5 iskier');
    await expect(page.getByRole('button', { name: 'Grządka 1, z ozdobą', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Kolejne odkrycie', exact: true }).click();
    await page.getByRole('button', { name: /01 Brama z niespodzianką/ }).click();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: /Przed wejściem jest stopień/ })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(nextPanel).toBeFocused();
    await expect(nextPanel).toBeInViewport();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Łąka iskier, odblokowana, ustaw bez kosztu, grządka 1', exact: true })).toBeFocused();
  });
}
