import { test, expect, type Page } from '@playwright/test';
import type { Place } from '../../web/src/types';

const fixtures: Place[] = Array.from({ length: 151 }, (_, i) => ({
  id: `map-fixture-${i}`, name: `Miejsce testowe ${i}`, category: 'culture',
  coordinates: i === 150 ? [20.04, 50.075] : [19.939 + (i % 10) * 0.0005, 50.055 + Math.floor(i / 10) * 0.0004],
  address: 'Dane przykładowe testu', description: 'Wyłącznie izolowany test interfejsu.',
  access: { wheelchair: 'unknown', widthCm: null, toilet: 'unknown', surface: null, entranceNotes: 'Brak audytu terenowego.' },
  sourceLabel: 'Izolowany test mapy', sourceUrl: 'https://example.com/fixture', verifiedAt: null,
}));

async function setup(page: Page, holdPage?: Promise<void>) {
  await page.route('https://tiles.openfreemap.org/styles/positron', route => route.fulfill({ json: {
    version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#eef1eb' } }],
  } }));
  await page.route(/\/api\/places(?:\?|$)/, async route => {
    const params = new URL(route.request().url()).searchParams;
    const offset = Number(params.get('offset') || 0);
    const matching = params.has('category') && params.get('category') !== 'culture' ? [] : fixtures;
    if (offset > 0 && holdPage) await holdPage;
    await route.fulfill({ json: {
      places: matching.slice(offset, offset + 100), total: matching.length,
      offset, nextOffset: offset + 100 < matching.length ? offset + 100 : null,
      ...(params.get('includeMap') === 'true' ? { mapPlaces: matching.map(({ id, name, category, coordinates }) => ({ id, name, category, coordinates })) } : {}),
    } });
  });
  await page.route(/\/api\/places\/map-fixture-\d+$/, route => {
    const place = fixtures.find(p => route.request().url().endsWith(`/${p.id}`));
    return route.fulfill({ json: place });
  });
  await page.goto('/app');
  await page.getByRole('button', { name: /^(Na razie pomiń|Pomiń na razie)$/ }).click();
  await expect(page.locator('.map-section')).toHaveAttribute('data-map-ready', 'true');
  const tour = page.getByRole('dialog', { name: 'Przewodnik po mapie', exact: true });
  if (await tour.isVisible()) await tour.getByRole('button', { name: 'Pomiń tutorial', exact: true }).click();
  await expect(page.locator('.place-card')).toHaveCount(100);
}

test('map includes points beyond the list page, and the next page has no gaps or duplicates', async ({ page }) => {
  await setup(page);
  await expect(page.locator('.map-filter-summary')).toContainText('151');
  await expect.poll(() => page.locator('.place-pin').evaluateAll(pins => pins.reduce((sum, pin) => sum + Number((pin as HTMLElement).dataset.placeCount), 0))).toBe(150);
  expect(await page.locator('.place-pin').count()).toBeLessThanOrEqual(5);
  await expect(page.locator('.place-pin:not(.place-cluster)')).toHaveCount(0);
  const more = page.getByRole('button', { name: 'Pokaż kolejne miejsca', exact: true });
  await more.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.place-card')).toHaveCount(151);
  expect(new Set(await page.locator('.place-card .place-name').allTextContents()).size).toBe(151);
  await expect(more).toHaveCount(0);
});

test('panning a selected place stays where the user moved the map', async ({ page }) => {
  await setup(page);
  await page.locator('.place-card').filter({ has: page.getByText(fixtures[0].name, { exact: true }) }).click();
  const marker = page.locator('.place-pin.is-selected');
  await expect(marker).toBeVisible();
  await page.waitForTimeout(700); // Initial selection camera transition.
  const initial = (await marker.boundingBox())!;
  const canvas = (await page.locator('.map-canvas').boundingBox())!;
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2 + 160);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width / 2 + 180, canvas.y + canvas.height / 2 + 160, { steps: 16 });
  await page.mouse.up();
  await page.waitForTimeout(1000); // Includes moveend and any unintended recenter animation.
  const moved = (await marker.boundingBox())!;
  expect(moved.x - initial.x).toBeGreaterThan(120);
  await page.waitForTimeout(700);
  expect(Math.abs((await marker.boundingBox())!.x - moved.x)).toBeLessThan(2);
  await page.getByRole('button', { name: 'Oddal mapę', exact: true }).click();
  await expect(marker).toBeVisible();
  await expect(page.locator('.place-pin:not(.place-cluster):not(.is-selected)')).toHaveCount(0);
});

test('a place outside the first page can be opened directly from the map', async ({ page }, testInfo) => {
  await setup(page);
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Oddal mapę', exact: true }).click();
    await page.waitForTimeout(350);
  }
  const far = page.getByRole('button', { name: `Pokaż miejsce: ${fixtures[150].name}`, exact: true });
  await expect(far).toHaveCount(0);
  await page.locator('.place-cluster[data-place-count="1"]').click();
  await expect(far).toBeVisible();
  const detail = page.waitForRequest(request => request.url().endsWith('/api/places/map-fixture-150'));
  await far.click();
  await detail;
  await expect(page.locator('.place-detail h1, .place-detail h2').filter({ hasText: fixtures[150].name })).toBeVisible();
  await expect(page.locator('.place-detail')).toContainText('Izolowany test mapy');
  await page.screenshot({ path: testInfo.outputPath('place-outside-first-page.png') });
});

test('a late next-page response cannot replace a new filter selection', async ({ page }) => {
  let release!: () => void;
  await setup(page, new Promise<void>(resolve => { release = resolve; }));
  const pending = page.waitForRequest(request => new URL(request.url()).searchParams.get('offset') === '100');
  await page.getByRole('button', { name: 'Pokaż kolejne miejsca', exact: true }).click();
  await pending;
  await page.getByRole('button', { name: 'Toalety', exact: true }).click();
  await expect(page.getByText('Nie znaleźliśmy takiego miejsca.', { exact: true })).toBeVisible();
  release();
  await page.waitForTimeout(400);
  await expect(page.locator('.place-card')).toHaveCount(0);
  await expect(page.locator('.place-pin')).toHaveCount(0);
});

test('phone map keeps all matching points available and the list can load the next page', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await expect(page.locator('.map-filter-summary')).toContainText('151');
  await page.screenshot({ path: testInfo.outputPath('phone-map.png') });
  await page.getByRole('button', { name: 'Pokaż listę', exact: true }).click();
  await page.getByRole('button', { name: 'Pokaż kolejne miejsca', exact: true }).click();
  await expect(page.locator('.place-card')).toHaveCount(151);
  await expect(page.getByRole('button', { name: 'Pokaż kolejne miejsca', exact: true })).toHaveCount(0);
});

test('failed detail lookup keeps the map usable and does not invent place facts', async ({ page }) => {
  await setup(page);
  await page.route('**/api/places/map-fixture-150', route => route.fulfill({ status: 503, json: { error: { message: 'Szczegóły miejsca są chwilowo niedostępne.' } } }));
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Oddal mapę', exact: true }).click();
    await page.waitForTimeout(350);
  }
  await page.locator('.place-cluster[data-place-count="1"]').click();
  await page.getByRole('button', { name: `Pokaż miejsce: ${fixtures[150].name}`, exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Szczegóły miejsca są chwilowo niedostępne.' })).toBeVisible();
  await expect(page.locator('.place-detail')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Oddal mapę', exact: true })).toBeEnabled();
});

test('real catalog map covers Krakow beyond the centre without the 100-place cap', async ({ request }) => {
  const response = await request.get('/api/places?limit=100&includeMap=true');
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  expect(data.places).toHaveLength(100);
  expect(data.mapPlaces.length).toBeGreaterThan(1000);
  expect(data.mapPlaces.some((p: Place) => p.coordinates[0] > 20.04)).toBeTruthy();
  expect(data.mapPlaces.some((p: Place) => p.coordinates[0] < 19.9)).toBeTruthy();
  expect(data.mapPlaces.length).toBe(data.total);
});

async function farMapPin(page: Page) {
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Oddal mapę', exact: true }).click();
    await page.waitForTimeout(350);
  }
  const pin = page.getByRole('button', { name: `Pokaż miejsce: ${fixtures[150].name}`, exact: true });
  await page.locator('.place-cluster[data-place-count="1"]').click();
  await expect(pin).toBeVisible();
  return pin;
}

test('loading and failed place details remain unobscured at desktop and phone widths', async ({ page }, testInfo) => {
  await setup(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/places/map-fixture-150', async route => {
    await pending;
    await route.fulfill({ status: 503, json: { error: { message: 'Szczegóły miejsca są chwilowo niedostępne. Spróbuj ponownie za chwilę.' } } });
  });
  await (await farMapPin(page)).click();
  const status = page.getByRole('status').filter({ hasText: 'Wczytujemy szczegóły miejsca' });
  await expect(status).toBeVisible();
  await page.getByRole('button', { name: /Krawężniki i drogi/ }).click();
  await expect(page.getByRole('dialog', { name: 'Krawężniki i drogi · OSM' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Krawężniki i drogi · OSM' })).not.toBeVisible();
  try {
    for (const viewport of [{ width: 2951, height: 1100 }, { width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      const box = (await status.boundingBox())!;
      const mapBox = (await page.locator('.map-section').boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(mapBox.y + 1);
      expect(await status.evaluate(node => {
        const rect = node.getBoundingClientRect();
        return [0.1, 0.5, 0.9].every(fraction => node.contains(document.elementFromPoint(rect.left + rect.width * fraction, rect.top + rect.height / 2)));
      })).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`place-loading-${viewport.width}.png`) });
    }
  } finally { release(); }
  await expect(page.getByRole('status').filter({ hasText: 'Szczegóły miejsca są chwilowo niedostępne.' })).toBeVisible();
  await expect(page.locator('.place-detail')).toHaveCount(0);
});

test('opening and closing filters preserves the existing selected map marker', async ({ page }) => {
  await setup(page);
  await page.locator('.place-card').first().click();
  const marker = page.locator('.place-pin.is-selected');
  await expect(marker).toBeVisible();
  await page.waitForTimeout(800);
  const node = await marker.elementHandle();
  await page.getByRole('button', { name: 'Zmień filtry mapy', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Filtry mapy', exact: true })).toBeVisible();
  expect(await node!.evaluate(element => element.isConnected)).toBe(true);
  await page.getByRole('button', { name: 'Zamknij filtry', exact: true }).click();
  expect(await node!.evaluate(element => element.isConnected)).toBe(true);
});

test('recent map details are reused until catalogue refresh', async ({ page }) => {
  await setup(page);
  let reads = 0;
  await page.route('**/api/places/map-fixture-150', route => {
    reads++;
    return route.fulfill({ json: fixtures[150] });
  });
  await (await farMapPin(page)).click();
  await expect(page.locator('.place-detail h1')).toHaveText(fixtures[150].name);
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Wszystkie miejsca', exact: true }).click();
  await page.getByRole('button', { name: `Pokaż miejsce: ${fixtures[150].name}`, exact: true }).click();
  await expect(page.locator('.place-detail h1')).toHaveText(fixtures[150].name);
  expect(reads).toBe(1);
  // An explicit catalogue refresh must invalidate potentially changed source facts.
  await page.getByRole('button', { name: 'Mapa', exact: true }).click();
  await expect(page.locator('.place-card')).toHaveCount(100);
  await page.getByRole('button', { name: `Pokaż miejsce: ${fixtures[150].name}`, exact: true }).click();
  await expect(page.locator('.place-detail h1')).toHaveText(fixtures[150].name);
  expect(reads).toBe(2);
});

test('choosing a list place while a map detail is pending keeps the latest choice', async ({ page }) => {
  await setup(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/places/map-fixture-150', async route => {
    await pending;
    await route.fulfill({ json: fixtures[150] });
  });
  await (await farMapPin(page)).click();
  await expect(page.getByRole('status').filter({ hasText: 'Wczytujemy szczegóły miejsca' })).toBeVisible();
  const aborted = page.waitForEvent('requestfailed', request => request.url().endsWith('/api/places/map-fixture-150'));
  await page.locator('.place-card').filter({ has: page.getByText(fixtures[0].name, { exact: true }) }).click();
  release();
  await aborted;
  await expect(page.locator('.place-detail h1')).toHaveText(fixtures[0].name);
  await expect(page.getByRole('status').filter({ hasText: 'Wczytujemy szczegóły miejsca' })).toHaveCount(0);
});
