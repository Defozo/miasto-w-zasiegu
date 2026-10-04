import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('merged P+R has city facts, OSM provenance and no duplicated stop suggestions', async ({ page }, testInfo) => {
  const origin = process.env.ROUTE_RECOVERY_API_ORIGIN;
  test.skip(!origin, 'Requires the isolated parking integration API.');
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `${origin}${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });
  await page.goto('/app');
  await page.getByRole('button', { name: 'Pomiń na razie', exact: true }).click();
  const search = page.getByRole('combobox', { name: 'Miejsce lub adres', exact: true });
  await search.fill('P+R Kurdwanów');
  await expect(page.getByRole('listbox', { name: 'Podpowiedzi: Miejsce lub adres' }).getByRole('option').first()).toBeVisible();
  await search.press('ArrowDown'); await search.press('Enter');
  await expect(page.getByRole('heading', { name: 'Parking według danych miasta' })).toBeVisible();
  const facts = page.getByRole('region', { name: 'Zasady korzystania' });
  await expect(facts).toContainText('167');
  await expect(facts).toContainText('7');
  await expect(facts).toContainText('nie liczba wolnych miejsc');
  const evidence = page.getByRole('region', { name: 'Źródło i aktualność' });
  await expect(evidence).toContainText('Zarząd Transportu Publicznego');
  await expect(evidence).toContainText('OpenStreetMap');
  expect((await new AxeBuilder({ page }).include('.place-facts').include('.place-evidence').analyze()).violations).toEqual([]);
  await facts.screenshot({ path: testInfo.outputPath('municipal-parking-facts.png') });
  const locations = await page.request.get(`${origin}/api/locations?q=Teatr%20S%C5%82owackiego&limit=20`);
  const data = await locations.json();
  expect(data.locations.filter((p: { label: string }) => /^Teatr Słowackiego 0[1-4]$/.test(p.label))).toHaveLength(4);
});
