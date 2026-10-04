import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import exifr from 'exifr';
import { reportPhotoFixture } from '../helpers/report-photo-fixture.mjs';

async function openReport(page: Page, result: 'ok' | 'failed' | 'empty' = 'ok') {
  const requests: Record<string, unknown>[] = [];
  await page.route('**/api/report-photos/config', route => route.fulfill({ json: { enabled: true, provider: 'OpenAI', storesPhoto: false } }));
  await page.route('**/api/report-photos', async route => {
    const body = route.request().postDataJSON(); requests.push(body);
    const image = Buffer.from(body.image.split(',')[1], 'base64');
    expect(await exifr.gps(image)).toBeUndefined();
    expect(body).not.toHaveProperty('coordinates');
    expect(body).not.toHaveProperty('gps');
    await route.fulfill({ status: 202, json: { id: 'isolated-test', status: 'analyzing', message: 'Test', result: null } });
  });
  await page.route('**/api/report-photos/isolated-test?*', route => route.fulfill({ json: {
    id: 'isolated-test', status: result === 'failed' ? 'failed' : 'complete',
    message: result === 'failed' ? 'Nie udało się przeanalizować zdjęcia.' : result === 'empty' ? 'Nie ma pewnej propozycji z tego zdjęcia.' : 'Sprawdź propozycję testową.',
    result: result === 'failed' ? null : { observations: result === 'empty' ? [] : [{ kind: 'steps', description: 'Dane testowe: schody przy wejściu.', effect: 'barrier', duration: 'permanent', suggestedGeometry: 'Point', evidence: 'Testowa odpowiedź modelu.', uncertainty: 'Brak pomiaru.' }] },
  } }));
  await page.goto('/app?obserwacje');
  expect((await (await page.request.get('/api/test-environment')).json()).isolated).toBe(true);
  await page.getByRole('button', { name: /^(Pomiń na razie|Na razie pomiń)$/ }).click();
  await page.getByRole('button', { name: 'Dodaj obserwację', exact: true }).click();
  return requests;
}
async function upload(page: Page, gps = true) {
  await page.getByLabel('Plik zdjęcia bariery', { exact: true }).setInputFiles({ name: 'isolated-fixture.jpg', mimeType: 'image/jpeg', buffer: await reportPhotoFixture(gps) });
  await expect(page.getByAltText('Wybrane zdjęcie do przygotowania obserwacji')).toBeVisible();
}
test('photo GPS and draft require explicit application and review; publish only the reviewed observation', async ({ page }) => {
  const requests = await openReport(page);
  let published = 0;
  page.on('request', request => { if (request.url().endsWith('/api/reports') && request.method() === 'POST') published++; });
  await upload(page);
  await page.getByRole('button', { name: 'Użyj lokalizacji zdjęcia' }).click();
  await page.getByText('Zasięg, wymiary i dodatkowe szczegóły', { exact: true }).click();
  await page.getByLabel('Dokładność zaznaczenia').selectOption('precise');
  await page.getByLabel('Wysokość progu / krawężnika (cm)').fill('10');
  await page.getByLabel('Skąd są wymiary?').selectOption('measured');
  await page.getByText('Zasięg, wymiary i dodatkowe szczegóły', { exact: true }).click();
  await page.getByRole('button', { name: 'Przeanalizuj zdjęcie', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Użyj tej propozycji' })).toBeVisible();
  expect(published).toBe(0); expect(requests).toHaveLength(1);
  await expect(page.getByLabel('Krótki opis')).toHaveValue('');
  await page.getByRole('button', { name: 'Użyj tej propozycji' }).click();
  await expect(page.getByLabel('Rodzaj obserwacji', { exact: true })).toHaveValue('steps');
  const submit = page.getByRole('dialog').getByRole('button', { name: 'Dodaj obserwację', exact: true });
  await expect(submit).toBeDisabled();
  await page.getByLabel('Sprawdziłem opis, położenie i datę obserwacji.').check();
  await page.getByLabel('Krótki opis').fill('Dane testowe: dwa widoczne stopnie przy wejściu.');
  await expect(submit).toBeDisabled();
  await page.getByLabel('Sprawdziłem opis, położenie i datę obserwacji.').check();
  await page.getByLabel('Krótki opis').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/report-photo/review-desktop.png' });
  const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/reports') && response.request().method() === 'POST');
  await submit.click();
  const response = await responsePromise; expect(response.status()).toBe(201);
  const saved = await response.json();
  expect(saved.inputMethod).toBe('photo-ai'); expect(saved.locationSource).toBe('photo-gps');
  expect(saved.heightCm).toBeNull(); expect(saved.widthCm).toBeNull(); expect(saved.measurement).toBe('unknown');
  expect(saved.locationAccuracy).toBe('approximate'); expect(saved.verification).toBe('unverified');
  expect(saved.coordinates[0]).toBeCloseTo(19.94); expect(saved.coordinates[1]).toBeCloseTo(50.06);
  expect(published).toBe(1);
});
test('missing photo GPS uses permitted browser position; mobile form remains accessible', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await context.grantPermissions(['geolocation']); await context.setGeolocation({ longitude: 19.941, latitude: 50.063, accuracy: 18 });
  await openReport(page); await upload(page, false);
  await expect(page.getByText('Zdjęcie nie zawiera lokalizacji GPS.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Użyj mojego położenia' }).click();
  await expect(page.getByText('Dokładność GPS: około 18 m.', { exact: false })).toBeVisible();
  const audit = await new AxeBuilder({ page }).include('.report-dialog').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(audit.violations).toEqual([]);
  expect(await page.locator('.report-dialog').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.locator('.report-photo').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/report-photo/mobile.png' });
});
test('denied browser position and failed analysis preserve manual reporting and retry', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: (_success: unknown, error: (value: unknown) => void) => error({ code: 1 }) } }); });
  await openReport(page, 'failed');
  await page.getByRole('button', { name: 'Użyj mojego położenia' }).click();
  await expect(page.getByText('Nie udzielono dostępu do lokalizacji.', { exact: false })).toBeVisible();
  await upload(page); await page.getByRole('button', { name: 'Przeanalizuj zdjęcie', exact: true }).click();
  await expect(page.getByText('Nie udało się przeanalizować zdjęcia.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Przeanalizuj ponownie' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Użyj tej propozycji' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Użyj lokalizacji zdjęcia' }).click();
  await page.getByLabel('Krótki opis').fill('Dane testowe: ręczna obserwacja po awarii AI.');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Dodaj obserwację', exact: true })).toBeEnabled();
});
test('uncertain photo offers no invented suggestion and closing resets the next report', async ({ page }) => {
  await openReport(page, 'empty'); await upload(page);
  await page.getByRole('button', { name: 'Przeanalizuj zdjęcie', exact: true }).click();
  await expect(page.getByText('Nie ma pewnej propozycji z tego zdjęcia.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Użyj tej propozycji' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Zamknij zgłoszenie' }).click();
  await page.getByRole('button', { name: 'Dodaj obserwację', exact: true }).click();
  await expect(page.getByLabel('Krótki opis')).toHaveValue('');
  await expect(page.getByAltText('Wybrane zdjęcie do przygotowania obserwacji')).toHaveCount(0);
});

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`map picking from observations preserves the photo draft at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openReport(page);
    await upload(page, false);
    const description = 'Dane testowe: przeszkoda przy wejściu od podwórza.';
    await page.getByLabel('Krótki opis').fill(description);
    const pick = page.getByRole('button', { name: 'Wskaż na mapie', exact: true });
    const map = page.getByRole('region', { name: 'Mapa miejsc w Krakowie', exact: true });
    const back = page.getByRole('button', { name: 'Wróć do formularza', exact: true });

    await pick.click();
    await expect(map).toBeVisible();
    await expect(back).toBeFocused();
    await expect(back).toHaveAccessibleDescription(/Wskaż miejsce bariery/);
    await expect(page.locator('.accessibility-map-panel')).toBeHidden();
    await expect(page.locator('.toast')).toHaveCount(0);
    await back.click();
    await expect(page.getByRole('dialog', { name: 'Co jest na drodze?' })).toBeVisible();
    await expect(page.getByLabel('Krótki opis')).toHaveValue(description);
    await expect(page.getByAltText('Wybrane zdjęcie do przygotowania obserwacji')).toBeVisible();

    await pick.click();
    await expect(back).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Co jest na drodze?' })).toBeVisible();
    await expect(page.getByLabel('Krótki opis')).toHaveValue(description);

    await pick.click();
    await expect(map).toHaveAttribute('data-map-ready', 'true');
    const canvas = map.locator('canvas');
    const size = await canvas.boundingBox();
    expect(size).not.toBeNull();
    await canvas.click({ position: { x: Math.floor(size!.width / 2), y: Math.floor(size!.height * .55) } });
    await expect(page.getByRole('dialog', { name: 'Co jest na drodze?' })).toBeVisible();
    await expect(page.getByLabel('Krótki opis')).toHaveValue(description);
    await expect(page.getByAltText('Wybrane zdjęcie do przygotowania obserwacji')).toBeVisible();
    await expect(page.getByText('Położenie: wskazane ręcznie.', { exact: false })).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Dodaj obserwację', exact: true })).toBeEnabled();
    await pick.click();
    await page.getByRole('button', { name: 'Profil', exact: true }).click();
    await expect(page.locator('.app-shell')).not.toHaveClass(/report-picking/);
    await expect(page.locator('.content-panel')).toBeVisible();
    await page.getByRole('button', { name: 'Wspólnie: obserwacje', exact: true }).click();
    await page.getByRole('button', { name: 'Dodaj obserwację', exact: true }).click();
    await expect(page.getByLabel('Krótki opis')).toHaveValue(description);
    await expect(page.getByAltText('Wybrane zdjęcie do przygotowania obserwacji')).toBeVisible();
  });
}
