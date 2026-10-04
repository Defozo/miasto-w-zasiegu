import { test, expect } from '@playwright/test';

for (const width of [1440, 390]) {
  test(`album confirmation keeps keyboard focus in the album at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/gra?tryb=ogrod');
    const name = page.getByLabel('Nazwa nowej pocztówki', { exact: true });
    for (const title of ['Pierwsza próba', 'Druga próba']) {
      await name.fill(title);
      await page.getByRole('button', { name: 'Zachowaj ten widok', exact: true }).click();
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    }
    await page.getByRole('button', { name: 'Usuń pocztówkę: Pierwsza próba', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Tak, usuń pocztówkę', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Powiększ pocztówkę: Druga próba', exact: true })).toBeFocused();
    await expect(page.locator('.ig-album-notice')).toContainText('Usunięto pocztówkę „Pierwsza próba”');
    await expect(page.locator('.ig-album-notice')).toHaveAttribute('aria-live', 'polite');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Zastąp pocztówkę: Druga próba', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await page.getByLabel('Nazwa zastępowanej pocztówki', { exact: true }).fill('Nowa próba');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Tak, zastąp widok', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Powiększ pocztówkę: Nowa próba', exact: true })).toBeFocused();
    const remove = page.getByRole('button', { name: 'Usuń pocztówkę: Nowa próba', exact: true });
    await remove.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Anuluj', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(remove).toBeFocused();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(name).toBeFocused();
    await expect(name).toBeInViewport();
    await expect(page.locator('.ig-album-count')).toHaveText('0 z 3 pocztówek');
    await expect(page.locator('.ig-album-notice')).toContainText('Usunięto pocztówkę „Nowa próba”');
  });
}
