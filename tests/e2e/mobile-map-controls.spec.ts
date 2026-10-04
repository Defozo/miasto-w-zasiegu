import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { Route } from '../../web/src/types';

async function openMap(page: Page) {
  await page.addInitScript(() => localStorage.setItem('przejscie-map-tutorial-v1', '"completed"'));
  await page.route('https://tiles.openfreemap.org/styles/positron', route => route.fulfill({ json: {
    version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#eef1eb' } }],
  } }));
  await page.goto('/app');
  await page.getByRole('button', { name: 'Pomiń na razie', exact: true }).click();
  await expect(page.locator('.map-section')).toHaveAttribute('data-map-ready', 'true');
}

for (const width of [390, 1440]) {
  test(`map filters stay adjacent and OSM retains keyboard access at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await openMap(page);
    const filters = page.getByRole('button', { name: 'Zmień filtry mapy', exact: true });
    const osm = page.getByRole('button', { name: 'Krawężniki i drogi · OSM', exact: true });
    for (const control of [filters, osm]) {
      await expect(control).toBeInViewport();
      expect(await control.evaluate(node => {
        const box = node.getBoundingClientRect();
        return box.height >= 44 && box.width >= 44 && node.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
      })).toBe(true);
    }
    const left = (await filters.boundingBox())!, right = (await osm.boundingBox())!;
    expect(Math.abs(left.y - right.y)).toBeLessThanOrEqual(1);
    expect(left.x + left.width).toBeLessThanOrEqual(right.x);
    expect(right.width).toBeLessThan(100);
    await page.screenshot({ path: info.outputPath(`map-controls-${width}.png`) });
    await osm.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Krawężniki i drogi · OSM', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Nie oznacza potwierdzonej bariery');
    await dialog.getByRole('checkbox', { name: 'Krawężniki, schody, wejścia, windy' }).uncheck();
    await page.screenshot({ path: info.outputPath(`osm-dialog-${width}.png`) });
    expect((await new AxeBuilder({ page }).include('.access-layer-dialog').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(osm).toBeFocused();
    await osm.click();
    await expect(dialog.getByRole('checkbox', { name: 'Krawężniki, schody, wejścia, windy' })).not.toBeChecked();
    await dialog.getByRole('button', { name: 'Zamknij warstwę OSM' }).click();
    await filters.click();
    await expect(page.getByRole('dialog', { name: 'Filtry mapy', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('route instructions precede saving while native guidance help and privacy remain available', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    window.MiastoNative = {
      onmessage: null,
      postMessage(message) {
        const request = JSON.parse(message);
        const result = request.method === 'auth.status' ? { ready: true, userId: null } : request.method === 'local.import' ? {} : null;
        queueMicrotask(() => window.MiastoNative?.onmessage?.({ data: JSON.stringify({ id: request.id, result }) }));
      },
    };
  });
  const fixture: Route = {
    geometry: { type: 'LineString', coordinates: [[19.937, 50.065], [19.938, 50.065], [19.939, 50.066]] },
    distanceM: 240, durationS: 180,
    steps: [
      { instruction: 'Dane testowe: jedź prosto', distanceM: 110, wayPoints: [0, 1] },
      { instruction: 'Dane testowe: skręć w lewo', distanceM: 130, wayPoints: [1, 2] },
    ],
    warnings: ['Izolowany test układu, bez audytu terenowego.'], source: { engine: 'isolated UI fixture' },
  };
  await page.route('**/api/route', route => route.fulfill({ json: fixture }));
  await openMap(page);
  await page.getByRole('button', { name: /^Klub Pod Jaszczurami/ }).click();
  await page.getByRole('button', { name: 'Nawiguj', exact: true }).click();
  const list = page.getByRole('button', { name: 'Pokaż listę', exact: true });
  if (await list.isVisible()) await list.click();
  const from = page.getByRole('combobox', { name: 'Skąd', exact: true });
  await from.fill('Długa 12');
  await page.getByRole('listbox', { name: 'Podpowiedzi: Skąd' }).getByRole('option').first().click();
  await page.getByRole('button', { name: 'Wyznacz trasę', exact: true }).click();
  await expect(page.locator('.route-steps > li')).toHaveCount(2);
  expect(await page.locator('.route-save-section').evaluate(save => Boolean(document.querySelector('.route-steps')!.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await expect(page.locator('.route-result .uncertainty')).toContainText('Sprawdź warunki na swojej drodze');
  await expect(page.locator('.route-result .uncertainty')).toBeVisible();
  const help = page.locator('.guidance-help');
  await expect(help).not.toHaveAttribute('open', '');
  await page.getByText('Głos i zegarek', { exact: true }).click();
  await expect(help).toContainText('Telefon działa także bez zegarka');
  await page.getByText('Głos i zegarek', { exact: true }).click();
  await page.getByRole('heading', { name: 'Przebieg trasy', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('native-route-390.png') });
  await page.getByRole('button', { name: 'Zapisz plan', exact: true }).scrollIntoViewIfNeeded();
  await expect(page.locator('.route-save-section')).toContainText('wraz z adresami, potrzebami i instrukcjami');
  await expect(page.locator('.route-save-section')).toContainText('Nowy zastąpi poprzedni');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
