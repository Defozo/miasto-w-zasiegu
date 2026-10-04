import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// This suite covers the map after its introduction. First-visit behavior is in map-tutorial.spec.ts.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('przejscie-map-tutorial-v1', JSON.stringify('completed')));
});

test('keyboard flow reaches place facts and returns to the existing plan', async ({page}) => {
  test.setTimeout(120000);
  async function tabTo(target: ReturnType<typeof page.getByRole>) {
    for (let i = 0; i < 60; i++) {
      if (await target.evaluateAll(nodes => nodes.some(n => n === document.activeElement))) return;
      await page.keyboard.press('Tab');
    }
    await expect(target).toBeFocused();
  }
  await page.goto('/app');
  await expect(page.getByRole('heading', {name:'Jak się poruszasz?'})).toBeVisible({timeout:20000});
  await tabTo(page.getByRole('button', {name:'Pomiń na razie',exact:true}));
  await page.keyboard.press('Enter');
  await tabTo(page.getByRole('combobox', {name:'Miejsce lub adres',exact:true}));
  await page.keyboard.type('Wawel');
  await expect(page.getByRole('option').filter({hasText:'Wawel'}).first()).toBeVisible({timeout:15000});
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await expect(page.getByLabel('Najważniejsze warunki')).toBeVisible();
  await tabTo(page.getByRole('button', {name:'Nawiguj',exact:true}));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', {name:'Auto + dalszy odcinek',exact:true})).toBeVisible();
  await tabTo(page.getByRole('button', {name:'Mapa',exact:true}));
  await page.keyboard.press('Enter');
  await tabTo(page.getByRole('button', {name:'Wróć do planu podróży',exact:true}));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', {name:'Auto + dalszy odcinek',exact:true})).toBeVisible();
});

test('save partial setup keeps the chosen kind without inventing dimensions', async ({page}) => {
  await page.goto('/app');
  await page.getByRole('radio', {name:'Balkonik',exact:true}).check();
  await page.getByRole('button', {name:'Dalej',exact:true}).click();
  await page.getByRole('button', {name:'Zapisz i otwórz mapę',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const doc = await page.evaluate(() => JSON.parse(localStorage.getItem('przejscie-guest-presets-v1')!));
  expect(doc.presets[0].kind).toBe('walker');
  expect(doc.presets[0].profile.widthCm).toBe('');
  await expect(page.getByRole('combobox', {name:'Zestaw potrzeb',exact:true})).toHaveValue(doc.activePresetId);
});

test('skip setup, inspect real place, save it and plan without requesting location', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/app');
  await expect(page.getByRole('heading', {name:'Jak się poruszasz?'})).toBeVisible();
  await page.getByRole('button', {name:'Pomiń na razie'}).click();
  await expect(page.getByRole('combobox', {name:'Miejsce lub adres', exact:true})).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('przejscie-guest-presets-v1') || '{"presets":[]}').presets)).toHaveLength(0);
  await page.getByRole('combobox', {name:'Miejsce lub adres', exact:true}).fill('Wawel');
  await page.getByRole('option').filter({hasText:'Wawel'}).first().click();
  await expect(page.getByLabel('Najważniejsze warunki')).toContainText('Próg');
  await page.getByRole('button', {name:'Zapisz miejsce',exact:true}).click();
  await page.getByRole('button', {name:'Nawiguj',exact:true}).click();
  await expect(page.getByRole('button',{name:'Auto + dalszy odcinek',exact:true})).toBeVisible();
  await expect(page.getByRole('combobox',{name:/Skąd/}).first()).toHaveValue('');
  const audit = await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
  expect(audit.violations).toEqual([]);
  expect(errors).toEqual([]);
  await page.reload();
  await expect(page.getByRole('heading',{name:'Jak się poruszasz?'})).toHaveCount(0);
});

test('manual equipment setup, multiple presets and local persistence', async ({page}) => {
  await page.goto('/app');
  await page.getByRole('radio',{name:'Wózek elektryczny',exact:true}).check();
  await page.getByRole('checkbox',{name:'Korzystam też z samochodu'}).check();
  await page.getByRole('button',{name:'Dalej',exact:true}).click();
  await page.getByRole('button',{name:'Wpisz parametry',exact:true}).click();
  await page.getByLabel('Nazwa zestawu',{exact:true}).fill('Mój elektryczny');
  await page.getByLabel('Szerokość całkowita z wyposażeniem').fill('68');
  await page.getByRole('button',{name:'Zastosuj i pokaż mapę'}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'Profil',exact:true}).click();
  await page.getByRole('button',{name:'Dodaj zestaw'}).click();
  await page.getByRole('radio',{name:'Wózek dziecięcy'}).check();
  await page.getByRole('button',{name:'Dalej',exact:true}).click();
  await page.getByRole('button',{name:'Zastosuj i pokaż mapę'}).click();
  const doc = await page.evaluate(() => JSON.parse(localStorage.getItem('przejscie-guest-presets-v1')!));
  expect(doc.presets).toHaveLength(2); expect(doc.presets[0].profile.widthCm).toBe('68'); expect(doc.usesCar).toBe(true);
  await page.reload();
  await expect(page.getByRole('combobox',{name:'Zestaw potrzeb',exact:true})).toHaveValue(doc.activePresetId);
});

test('phone layout retains the map and exposes keyboard-operable sheet', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/app');
  await page.getByRole('button',{name:'Pomiń na razie'}).click();
  await expect(page.locator('.map-section')).toBeVisible();
  await page.getByRole('button',{name:'Pokaż listę',exact:true}).focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('button',{name:'Pokaż mapę',exact:true})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:'artifacts/redesign-mobile.png'});
  await page.getByRole('button',{name:'Pokaż mapę',exact:true}).click();
  await expect(page.locator('.place-card').first()).toBeVisible();
  await page.screenshot({path:'artifacts/redesign-mobile-map.png'});
});

test('car plan survives Google Maps and reload, then asks for an onward start', async ({page, context}) => {
  await context.route('https://www.google.com/maps/**', r => r.fulfill({body:'External navigation test boundary'}));
  const onward = {distanceM:650,durationS:600,geometry:{type:'LineString',coordinates:[[19.935,50.055],[19.936,50.053]]},steps:[{instruction:'Jedź do wejścia',distanceM:650,wayPoints:[0,1]}],warnings:[],source:{engine:'isolated test fixture'}};
  const alternative = {id:'test-parking',parking:{id:'test-parking',name:'Parking testowy',coordinates:[19.935,50.055],sourceUrl:'https://www.openstreetmap.org',parking:{disabledSpaces:null},access:{wheelchair:'unknown'}},drive:{...onward,distanceM:3000,durationS:500},onward,status:'incomplete',transfer:{vehicleEntrance:[19.935,50.055],mobilityExit:[19.935,50.055],alightingPoint:null,status:'unknown',message:'Brak danych o wyjściu z parkingu.'},warnings:['Nie znamy zajętości.']};
  await page.route('**/api/journeys', r => r.fulfill({json:{alternatives:[alternative],calculatedAt:'2026-10-03T10:00:00Z',note:'Test'}}));
  await page.goto('/app'); await page.getByRole('button',{name:'Pomiń na razie'}).click();
  await page.getByRole('combobox',{name:'Miejsce lub adres',exact:true}).fill('Wawel');
  await page.getByRole('option').filter({hasText:'Wawel'}).first().click();
  await page.getByRole('button',{name:'Nawiguj',exact:true}).click();
  await page.getByRole('button',{name:'Auto + dalszy odcinek',exact:true}).click();
  await page.getByRole('combobox',{name:/Skąd/}).first().fill('Długa 12');
  await page.getByRole('option').filter({hasText:'Długa 12'}).first().click();
  await page.getByRole('button',{name:'Wyznacz trasę',exact:true}).click();
  await expect(page.getByText('Brak danych o wyjściu z parkingu.',{exact:true})).toBeVisible();
  const popup = page.waitForEvent('popup'); await page.getByRole('link',{name:'Jedź do parkingu'}).click();
  const external = await popup; expect(external.url()).toContain('destination=50.055%2C19.935'); await external.close();
  await page.reload();
  await page.getByRole('button',{name:'Kontynuuj podróż od parkingu'}).click();
  await expect(page.getByText('Brak danych o wyjściu z parkingu.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Kontynuuj od parkingu',exact:true}).click();
  await expect(page.getByText(/Potwierdź punkt startu przy parkingu/)).toBeVisible();
  await expect(page.getByRole('button',{name:'Wyznacz trasę',exact:true})).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('przejscie-car-journey-guest'))).toBeNull();
});

test('late research remains bound to its preset; applying documentation keeps a measurement', async ({page}) => {
  const result = {id:'research-fixture',kind:'manual',status:'complete',phase:'review',message:'Sprawdź wariant',equipment:{name:'Model testowy',manufacturer:'Test',variant:'wariant A',widthCm:61,widthLabel:'61 cm',checkedAt:'2026-10-03',notes:'Dokumentacja testowa',parameters:[{label:'Szerokość całkowita',value:'61 cm',sourceUrl:'https://example.test/spec',quote:'Overall width 61 cm'}]}};
  await page.route('**/api/equipment/research', r=>r.fulfill({status:202,json:{...result,status:'searching',equipment:undefined}}));
  await page.route('**/api/equipment/research/*', r=>r.fulfill({json:result}));
  await page.goto('/app'); await page.getByRole('radio',{name:'Wózek manualny',exact:true}).check();
  await page.getByRole('button',{name:'Dalej',exact:true}).click();
  await page.getByLabel('Szerokość całkowita z wyposażeniem').fill('70');
  await page.getByRole('button',{name:'Wpisz model',exact:true}).click();
  await page.getByLabel('Producent i model').fill('Model testowy');
  await page.getByRole('button',{name:'Znajdź parametry'}).click();
  await page.getByRole('button',{name:'Użyj tych parametrów'}).click();
  await expect(page.getByLabel('Szerokość całkowita z wyposażeniem')).toHaveValue('70');
  await page.getByRole('button',{name:'Zmień sposób poruszania się'}).click();
  await page.getByRole('radio',{name:'Balkonik',exact:true}).check();
  await page.getByRole('button',{name:'Dalej',exact:true}).click();
  await expect(page.getByRole('button',{name:'Użyj tych parametrów'})).toHaveCount(0);
  await expect(page.getByLabel('Szerokość całkowita z wyposażeniem')).toHaveValue('');
});
