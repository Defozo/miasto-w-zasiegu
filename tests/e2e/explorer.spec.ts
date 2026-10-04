import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { reportPhotoFixture } from '../helpers/report-photo-fixture.mjs';

async function isolated(page: Page) { expect((await (await page.request.get('/api/test-environment')).json()).isolated).toBe(true); }
async function account(page: Page, label: string) {
  await isolated(page);
  const registration = await page.request.post('/api/auth/register', { data: { email: `explorer-${label}-${Date.now()}@example.invalid`, password: 'Synthetic-isolated-test-2026!', displayName: 'Odkrywca testowy' } });
  expect(registration.status()).toBe(201);
  return (await (await page.request.get('/api/auth/me')).json()).user;
}
async function point(page: Page, p: [number,number]) {
  await page.getByText('Szczegóły punktu: współrzędne', { exact: true }).click();
  await page.getByLabel('Szerokość geograficzna', { exact: true }).fill(String(p[1]));
  await page.getByLabel('Długość geograficzna', { exact: true }).fill(String(p[0]));
  await page.getByRole('button',{ name:'Ustaw punkt ze współrzędnych',exact:true }).click();
  await page.getByRole('button',{ name:'To miejsce obserwacji',exact:true }).click();
}
test('guest discovers real mission reasons, keyboard dialog and responsive collection without writes',async({page})=>{
  await isolated(page); const before=(await (await page.request.get('/api/reports')).json()).reports.length;
  await page.goto('/gra'); await expect(page.locator('.ex-mission').first()).toBeVisible();
  await expect(page.getByRole('heading',{name:'Zostaw po sobie dobry ślad.'})).toBeVisible();
  await expect(page.locator('.ex-mission')).toHaveCount(6);
  await expect(page.getByRole('button',{name:'Przybliż mapę',exact:true})).toBeVisible();
  await page.screenshot({path:'artifacts/iskry-explorer/desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Pokaż kolejne misje'}).focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.ex-mission')).toHaveCount(12);
  const search=page.getByRole('searchbox',{name:'Szukaj miejsca misji'});
  await search.fill('zxqaudit987');
  await expect(page.locator('.ex-mission-status')).toContainText('Brak misji');
  await expect(page.locator('.ex-mission-status')).toHaveAttribute('role','status');
  await expect(search).toBeFocused();
  await search.fill(''); await expect(page.locator('.ex-mission')).toHaveCount(6);
  await page.locator('.ex-mission').first().focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.ex-mission').first()).toBeFocused();
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
  await page.screenshot({path:'artifacts/iskry-explorer/mobile.png',fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await page.locator('.ex-mission-meta').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(11);
  await page.getByRole('button',{name:'Kolekcja odznak',exact:true}).click();
  await expect(page.locator('.ex-badge-tile')).toHaveCount(6);
  await page.screenshot({path:'artifacts/iskry-explorer/collection-mobile.png',fullPage:true});
  const audit=await new AxeBuilder({page}).include('.ex-app').withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
  expect(audit.violations).toEqual([]);
  expect((await (await page.request.get('/api/reports')).json()).reports.length).toBe(before);
});
test('photo assisted discovery earns server badges once and exports a real PNG card',async({page})=>{
  const user=await account(page,'photo');
  await page.route('**/api/report-photos',route=>route.fulfill({json:{id:'isolated-explorer-photo',status:'complete',message:'Wyłącznie testowa propozycja.',result:{observations:[{kind:'kerb',effect:'barrier',duration:'permanent',description:'Przy bocznych drzwiach znajduje się stopień na styku chodnika z wejściem.',evidence:'Widoczny stopień.',uncertainty:'Wysokość wymaga pomiaru.',suggestedGeometry:'Point'}]}}}));
  await page.goto('/gra');await expect(page.locator('.ex-player-strip')).toContainText('Odkrywca testowy');
  await page.getByRole('button',{name:'Mam własne odkrycie'}).click();
  await page.getByLabel('Plik zdjęcia bariery',{exact:true}).setInputFiles({name:'isolated-fixture.jpg',mimeType:'image/jpeg',buffer:await reportPhotoFixture(false)});
  await page.getByRole('button',{name:'Przeanalizuj zdjęcie',exact:true}).click();
  await page.getByRole('button',{name:'Użyj tej propozycji'}).click();
  await expect(page.getByLabel('Co opisujesz?')).toHaveValue('kerb');
  await point(page,[19.94,50.062]);
  await page.getByRole('checkbox',{name:'To moja obserwacja.'}).check();
  await page.screenshot({path:'artifacts/iskry-explorer/photo-review.png',fullPage:true});
  await page.getByRole('button',{name:'Zapisz odkrycie',exact:true}).click();
  await expect(page.locator('.ex-reward')).toContainText('+15 XP');
  const progress=await (await page.request.get('/api/game/explorer')).json();expect(progress.stats.xp).toBe(15);
  const reports=(await (await page.request.get('/api/reports')).json()).reports;
  const own=reports.find((r:any)=>r.isMine && r.inputMethod==='photo-ai');expect(own).toBeTruthy();expect(own.photoReviewed).toBe(true);expect(own.verification).toBe('unverified');
  await page.getByRole('button',{name:'Zobacz kolekcję',exact:true}).click();
  await expect(page.locator('.ex-badge-tile.unlocked')).toHaveCount(2);
  await page.getByRole('button',{name:'Moja wizytówka',exact:true}).last().click();
  await page.getByLabel('Nazwa na karcie').fill('Odkrywca');
  await page.screenshot({path:'artifacts/iskry-explorer/showcase.png',fullPage:true});
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Pobierz PNG'}).click();
  const download=await downloadPromise;expect(download.suggestedFilename()).toBe('iskry-moje-osiagniecia.png');
  await download.saveAs('artifacts/iskry-explorer/share-card.png');
  await page.reload();await expect(page.locator('.ex-player-numbers')).toContainText('15');
  expect((await (await page.request.get('/api/game/explorer')).json()).stats.xp).toBe(15);
  expect(user.id).toBeTruthy();
});
test('stale recheck rewards real update without declaring a barrier resolved',async({page})=>{
  await isolated(page);
  const old=await page.request.post('/api/reports',{data:{expectedUserId:null,kind:'obstacle',description:'Wyłącznie testowe zgłoszenie: drewniane ogrodzenie zajmuje część chodnika przy wejściu.',coordinates:[19.939,50.061],duration:'temporary',observedAt:new Date(Date.now()-3*86400000).toISOString()}});
  expect(old.status()).toBe(201);const oldReport=await old.json();
  const user=await account(page,'refresh');
  await page.goto('/gra');await expect(page.locator('.ex-mission').first()).toContainText('Daj tej informacji nową datę');
  await page.locator('.ex-mission').first().click();
  await page.getByLabel('Widzę zmianę',{exact:true}).check();
  await page.getByLabel('Co sprawdzono na miejscu?').fill('Wyłącznie testowa aktualizacja: ogrodzenie zniknęło i widać ponownie cały chodnik przy wejściu.');
  await point(page,oldReport.coordinates);await page.getByRole('checkbox',{name:'To moja obserwacja.'}).check();
  await page.getByRole('button',{name:'Zapisz odkrycie',exact:true}).click();
  await expect(page.locator('.ex-reward')).toContainText('+25 XP');
  const state=await (await page.request.get('/api/game/explorer')).json();expect(state.stats.refreshes).toBe(1);
  const current=(await (await page.request.get('/api/reports')).json()).reports.find((r:any)=>r.id===oldReport.id);
  expect(current.disputed).toBe(true);expect(current.status).toBe('active');
  await page.request.post('/api/auth/logout');
  await page.reload();await expect(page.locator('.ex-player-strip')).toContainText('Twój miejski profil');
  expect((await (await page.request.get('/api/game/explorer')).json()).stats.xp).toBe(0);
  expect(user.id).toBeTruthy();
});

for (const effect of ['barrier', 'facility'] as const) {
  test(`photo of a rest place preserves ${effect} meaning and shared progress`, async ({ page }) => {
    await account(page, `rest-${effect}`);
    await page.route('**/api/report-photos', route => route.fulfill({ json: { id: 'isolated-rest-photo', status: 'complete', result: { observations: [{ kind: 'rest_place', effect, duration: 'permanent', description: effect === 'barrier' ? 'Testowa ławka ma uszkodzone siedzisko i nie da się na niej usiąść.' : 'Testowa ławka stoi przy szerokim chodniku, obok pozostaje wolne miejsce.', evidence: 'Testowy obraz.', uncertainty: 'Warunki wymagają sprawdzenia.', suggestedGeometry: 'Point' }] } } }));
    await page.goto('/gra');
    await expect(page.locator('.ex-player-strip')).toContainText('Odkrywca testowy');
    await page.getByRole('button', { name: 'Mam własne odkrycie' }).click();
    await page.getByLabel('Plik zdjęcia bariery', { exact: true }).setInputFiles({ name: 'isolated-fixture.jpg', mimeType: 'image/jpeg', buffer: await reportPhotoFixture(false) });
    await page.getByRole('button', { name: 'Przeanalizuj zdjęcie', exact: true }).click();
    await page.getByRole('button', { name: 'Użyj tej propozycji' }).click();
    await expect(page.getByLabel('Co opisujesz?')).toHaveValue(effect === 'barrier' ? 'rest_issue' : 'rest_place');
    await point(page, effect === 'barrier' ? [19.95, 50.067] : [19.96, 50.067]);
    await page.getByRole('checkbox', { name: 'To moja obserwacja.' }).check();
    const save = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === (effect === 'barrier' ? '/api/reports' : '/api/observations'));
    await page.getByRole('button', { name: 'Zapisz odkrycie', exact: true }).click();
    const body = (await save).postDataJSON();
    expect(effect === 'barrier' ? body.effect : body.type).toBe(effect === 'barrier' ? 'barrier' : 'rest_place');
    await expect(page.locator('.ex-reward')).toContainText('+15 XP');
    expect((await (await page.request.get('/api/game/explorer')).json()).stats.rests).toBe(1);
  });
}

test('contribution made through the main report API appears in the game without a separate claim', async ({ page }) => {
  const user = await account(page, 'main-app');
  const saved = await page.request.post('/api/reports', { data: { expectedUserId: user.id, kind: 'width', coordinates: [19.972, 50.071], description: 'Testowy pomiar wejścia: przy rozwartych drzwiach pozostaje dziewięćdziesiąt centymetrów wolnego przejścia.', widthCm: 90, measurement: 'measured', observedAt: new Date().toISOString() } });
  expect(saved.status()).toBe(201);
  expect((await saved.json()).explorerReward.awarded).toBe(20);
  await page.goto('/gra');
  await expect(page.locator('.ex-player-numbers')).toContainText('20');
  const state = await (await page.request.get('/api/game/explorer')).json();
  expect(state.stats.measurements).toBe(1);
  expect(state.badges.find((badge: any) => badge.id === 'measure').level).toBe(1);
});
