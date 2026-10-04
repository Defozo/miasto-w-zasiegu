// Isolated emulator test: the normal app and the real database are never cleared.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { _android as android } from 'playwright';
import assert from 'node:assert/strict';
const serial = 'emulator-5554', pkg = 'pl.przejscie.app.validation';
const out = resolve('artifacts/hybrid/phone'); mkdirSync(out, { recursive: true });
const adbPath = `${process.env.LOCALAPPDATA}/Android/Sdk/platform-tools/adb.exe`;
const adb = (...args) => execFileSync(adbPath, ['-s', serial, ...args], { encoding: 'utf8', timeout: 35000 });
const delay = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = text => { results.push(text); console.log(`PASS ${text}`); };
function screenshot(name) { writeFileSync(`${out}/${name}.png`, execFileSync(adbPath, ['-s', serial, 'exec-out', 'screencap', '-p'], { timeout: 35000 })); }
async function waitForMapPixels(name, color) {
  // Inspect only the map, excluding the instruction card, footer and controls.
  // A world map or a button with the right label cannot satisfy this check.
  for (let attempt = 0; attempt < 15; attempt++) {
    screenshot(name);
    const count = Number(execFileSync('python', ['-c',
      'from PIL import Image; import sys; im=Image.open(sys.argv[1]).convert("RGB"); w,h=im.size; rgb=tuple(map(int,sys.argv[2].split(","))); print(sum(1 for p in im.crop((0,int(h*.32),int(w*.8),int(h*.73))).getdata() if all(abs(p[i]-rgb[i])<4 for i in range(3))))',
      `${out}/${name}.png`, color], { encoding: 'utf8', timeout: 10000 }));
    if (count > 100) return;
    await delay(2000);
  }
  throw new Error(`The actual map does not render ${name} (${color}).`);
}
async function nativeTree() {
  for (let attempt = 0; attempt < 3; attempt++) {
    // UIAutomator may report an empty root while Android is opening a dialog.
    // Never let a previous dump stand in for the current screen.
    adb('shell', 'rm', '-f', '/sdcard/hybrid-validation.xml');
    adb('shell', 'uiautomator', 'dump', '/sdcard/hybrid-validation.xml');
    try {
      const xml = adb('exec-out', 'cat', '/sdcard/hybrid-validation.xml');
      if (xml.includes('<hierarchy')) { writeFileSync(`${out}/current.xml`, xml); return xml; }
    } catch { /* Retry the transitioning screen. */ }
    await delay(500);
  }
  throw new Error('Android did not expose the current UI tree.');
}
async function tapNative(text) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const xml = await nativeTree();
    const tag = [...xml.matchAll(/<node\b[^>]+>/g)].map(m => m[0]).find(v => v.includes(`text="${text}"`) || v.includes(`content-desc="${text}"`));
    const rect = tag?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (rect && Number(rect[3]) > Number(rect[1]) && Number(rect[4]) > Number(rect[2])) {
      adb('shell', 'input', 'tap', String(Math.round((Number(rect[1]) + Number(rect[3])) / 2)), String(Math.round((Number(rect[2]) + Number(rect[4])) / 2))); return;
    }
    const dimensions = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/);
    adb('shell', 'input', 'swipe', String(Math.round(+dimensions[1] / 2)), String(Math.round(+dimensions[2] * .78)), String(Math.round(+dimensions[1] / 2)), String(Math.round(+dimensions[2] * .35)), '300');
    await delay(250);
  }
  throw new Error(`Missing native control: ${text}`);
}
let device;
let restoreLocation;
try {
  assert.equal((await (await fetch('http://127.0.0.1:3082/api/test-environment')).json()).isolated, true);
  console.log('Isolated API confirmed; starting the validation app.');
  adb('reverse', 'tcp:3082', 'tcp:3082');
  adb('shell', 'am', 'force-stop', pkg);
  adb('shell', 'pm', 'clear', pkg);
  for (const permission of ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'POST_NOTIFICATIONS']) {
    adb('shell', 'pm', 'revoke', pkg, `android.permission.${permission}`);
  }
  adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
  adb('shell', 'wm', 'dismiss-keyguard');
  adb('shell', 'am', 'start', '-n', `${pkg}/pl.przejscie.phone.MainActivity`);
  device = (await android.devices()).find(d => d.serial() === serial);
  assert.ok(device);
  const webview = await device.webView({ pkg }, { timeout: 120000 });
  const page = await webview.page();
  console.log('Connected to the Android WebView.');
  page.setDefaultTimeout(30000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  // Local migration and account readiness are separate bounded native requests.
  // A cold WebView can still be showing the startup state when CDP attaches.
  await page.getByRole('button', { name: 'Pomiń na razie', exact: true }).waitFor({ timeout: 75000 });
  await page.getByRole('button', { name: 'Pomiń na razie', exact: true }).click();
  const tutorial = page.getByRole('button', { name: 'Pomiń tutorial' });
  if (await tutorial.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) await tutorial.click();
  await page.getByRole('combobox', { name: 'Miejsce lub adres', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => typeof window.MiastoNative?.postMessage), 'function');
  screenshot('map'); check('Bundled web UI renders inside the real Android WebView');
  await page.getByRole('button', { name: 'Profil', exact: true }).click();
  await page.getByRole('button', { name: 'Dodaj zestaw', exact: true }).click();
  await page.getByRole('radio', { name: 'Wózek manualny', exact: true }).check();
  await page.getByRole('button', { name: 'Dalej', exact: true }).click();
  await page.getByRole('button', { name: 'Wpisz parametry', exact: true }).click();
  const width = page.getByRole('spinbutton', { name: /Szerokość całkowita/ });
  await width.fill('5');
  await page.getByRole('button', { name: 'Zastosuj i pokaż mapę', exact: true }).click();
  const widthError = page.getByRole('alert').filter({ hasText: 'Podaj szerokość od 30 do 200 cm' });
  await widthError.waitFor();
  assert.equal(await width.evaluate(el => el === document.activeElement), true);
  assert.equal(await width.inputValue(), '5');
  const visibleRatio = await widthError.evaluate(el => new Promise(resolve => {
    const observer = new IntersectionObserver(([entry]) => { observer.disconnect(); resolve(entry.intersectionRatio); });
    observer.observe(el);
  }));
  assert.equal(visibleRatio, 1); screenshot('width-error');
  await width.fill('70');
  await page.getByRole('button', { name: 'Zastosuj i pokaż mapę', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Zapisano zestaw potrzeb' }).waitFor();
  check('Invalid width is visible and focused in the real WebView; correction saves');
  async function address(label, query, option) {
    await page.getByRole('combobox', { name: label, exact: true }).fill(query);
    await page.getByRole('listbox', { name: `Podpowiedzi: ${label}` }).getByRole('option', { name: option }).first().click();
  }
  await address('Miejsce lub adres', 'Rynek Główny 1', /Rynek/);
  screenshot('place');
  await page.getByRole('button', { name: 'Nawiguj', exact: true }).click();
  await address('Skąd', 'Długa 12', /Długa/);
  await page.getByRole('button', { name: 'Wyznacz trasę', exact: true }).click();
  await page.getByRole('button', { name: 'Rozpocznij prowadzenie', exact: true }).waitFor({ timeout: 45000 });
  screenshot('route'); check('Real addresses and ORS route work through same-origin API');
  await page.getByRole('button', { name: 'Rozpocznij prowadzenie', exact: true }).click();
  await delay(2500);
  const plan = await nativeTree();
  assert.match(plan, /GOTOWI DO DROGI/); assert.match(plan, /Pokaż całą trasę/); assert.match(plan, /OpenStreetMap/);
  await waitForMapPixels('native-plan', '23,60,50');
  check('The web action opens the native map with route overview and attribution');
  await tapNative('Wycisz głos'); assert.match(await nativeTree(), /Włącz głos/);
  assert.match(adb('exec-out', 'run-as', pkg, 'cat', 'shared_prefs/guidance-voice.xml'), /name="muted" value="true"/);
  await tapNative('Włącz głos'); assert.match(await nativeTree(), /Wycisz głos/);
  check('Compact speaker toggle changes and remembers the voice preference before starting GPS');
  await tapNative('Plan i warunki'); assert.match(await nativeTree(), /Plan i warunki/); screenshot('route-details');
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK'); await delay(400);
  await tapNative('Włącz prowadzenie GPS'); await delay(500);
  let permission;
  for (let attempt = 0; attempt < 10; attempt++) {
    permission = await nativeTree();
    if (permission.includes('Nie udostępniono dokładnej lokalizacji')) break;
    const deny = [...permission.matchAll(/<node\b[^>]+>/g)].map(m => m[0]).find(v => /permission_deny_button/.test(v));
    // A permission activity can be visible a moment after UIAutomator returned
    // the app beneath it. Wait for its real control instead of tapping stale UI.
    if (!deny) { await delay(600); continue; }
    const rect = deny.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    adb('shell', 'input', 'tap', String(Math.round((+rect[1] + +rect[3]) / 2)), String(Math.round((+rect[2] + +rect[4]) / 2)));
    await delay(500);
  }
  assert.match(permission, /Nie udostępniono dokładnej lokalizacji/);
  assert.doesNotMatch(adb('shell', 'dumpsys', 'activity', 'services', pkg), /ServiceRecord[^\n]*GuidanceService/);
  check('Permission denial leaves the plan readable without starting GPS'); screenshot('location-denied');
  adb('shell', 'pm', 'grant', pkg, 'android.permission.ACCESS_FINE_LOCATION');
  adb('shell', 'pm', 'grant', pkg, 'android.permission.ACCESS_COARSE_LOCATION');
  adb('shell', 'pm', 'grant', pkg, 'android.permission.POST_NOTIFICATIONS');
  await tapNative('Włącz prowadzenie GPS'); await delay(1500);
  assert.match(adb('shell', 'dumpsys', 'activity', 'services', pkg), /GuidanceService/); check('Native foreground GPS service starts explicitly');
  const saved = adb('exec-out', 'run-as', pkg, 'cat', 'shared_prefs/route.xml');
  const raw = saved.match(/<string name="json">([\s\S]*?)<\/string>/)[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&apos;', "'");
  const route = JSON.parse(raw), point = route.geometry.coordinates[1];
  let guidance = '';
  for (let attempt = 0; attempt < 12; attempt++) {
    adb('emu', 'geo', 'fix', String(point[0]), String(point[1])); await delay(2000);
    guidance = adb('exec-out', 'run-as', pkg, 'cat', 'shared_prefs/guidance.xml');
    if (/<string name="mode">live<\/string>/.test(guidance)) break;
  }
  assert.match(guidance, /<string name="mode">live<\/string>/);
  // The Compose screen polls the service state. Verify that its visible maneuver
  // also caught up, not only the persisted frame.
  await delay(1500);
  assert.match(await nativeTree(), /NASTĘPNY MANEWR/);
  await waitForMapPixels('gps', '30,100,218');
  check('Synthetic emulator GPS reaches the native maneuver engine and screen');
  assert.match(await nativeTree(), /Mapa śledzi pozycję/);
  await tapNative('Pokaż całą trasę'); await delay(900);
  assert.match(await nativeTree(), /Wróć do mojej pozycji/); screenshot('overview');
  await tapNative('Wróć do mojej pozycji'); await delay(900); screenshot('following');
  assert.match(await nativeTree(), /Mapa śledzi pozycję/);
  const dimensions = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/);
  adb('shell', 'input', 'swipe', String(Math.round(+dimensions[1] * .35)), String(Math.round(+dimensions[2] * .55)), String(Math.round(+dimensions[1] * .72)), String(Math.round(+dimensions[2] * .55)), '500');
  await delay(900); assert.match(await nativeTree(), /Wróć do mojej pozycji/); screenshot('panned');
  await tapNative('Wróć do mojej pozycji');
  check('Route overview, follow-position control and manual map panning are available during guidance');
  const voiceTree = await nativeTree();
  if (voiceTree.includes('content-desc="Wycisz głos"')) {
    await tapNative('Wycisz głos'); await delay(1500); assert.match(await nativeTree(), /Włącz głos/);
    await tapNative('Włącz głos'); assert.match(await nativeTree(), /Wycisz głos/);
    check('Available local voice starts with guidance and can be muted and restored');
  } else {
    assert.match(voiceTree, /Głos niedostępny. Ustawienia mowy/);
    await tapNative('Głos niedostępny. Ustawienia mowy'); assert.match(await nativeTree(), /Ustawienia mowy/);
    await tapNative('Zamknij'); check('Missing offline voice exposes settings through the compact speaker button');
  }
  restoreLocation = adb('shell', 'cmd', 'location', 'is-location-enabled').trim();
  adb('shell', 'cmd', 'location', 'set-location-enabled', 'false');
  await delay(27000);
  const stale = await nativeTree();
  assert.match(stale, /Brak świeżego GPS/); assert.match(stale, /Brak dokładnej, aktualnej pozycji/);
  screenshot('gps-unavailable');
  check('Loss of GPS replaces the maneuver with a clear warning and invalidates the current position');
  adb('shell', 'cmd', 'location', 'set-location-enabled', 'true');
  for (let attempt = 0; attempt < 12; attempt++) {
    adb('emu', 'geo', 'fix', String(point[0]), String(point[1])); await delay(2000);
    if (/<string name="mode">live<\/string>/.test(adb('exec-out', 'run-as', pkg, 'cat', 'shared_prefs/guidance.xml'))) break;
  }
  await waitForMapPixels('gps-recovered', '30,100,218');
  assert.match(await nativeTree(), /NASTĘPNY MANEWR/); check('A fresh GPS fix restores both the map marker and the maneuver');
  adb('shell', 'input', 'keyevent', 'KEYCODE_SLEEP'); await delay(2500);
  assert.match(adb('shell', 'dumpsys', 'activity', 'services', pkg), /GuidanceService/);
  check('Guidance service remains active while the display is off');
  adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP'); adb('shell', 'wm', 'dismiss-keyguard');
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK'); await delay(500);
  await page.getByRole('button', { name: 'Rozpocznij prowadzenie', exact: true }).waitFor();
  assert.match(adb('shell', 'dumpsys', 'activity', 'services', pkg), /GuidanceService/); check('Back returns to the same web plan while GPS continues');
  screenshot('map-with-guidance');
  await tapNative('Wróć do prowadzenia GPS');
  await tapNative('Zakończ prowadzenie');
  let services;
  for (let attempt = 0; attempt < 15; attempt++) {
    await delay(500);
    services = adb('shell', 'dumpsys', 'activity', 'services', pkg);
    if (!/ServiceRecord[^\n]*GuidanceService/.test(services)) break;
  }
  assert.doesNotMatch(services, /ServiceRecord[^\n]*GuidanceService/);
  check('Ending guidance stops the service');
  const summary = await nativeTree();
  assert.match(summary, /sesja pokazowa/); await tapNative('Zamknij');
  check('An emulator trip cannot be uploaded as a real journey');
  assert.deepEqual(errors, []); check('No JavaScript exceptions during the whole hybrid flow');
  writeFileSync(`${out}/results.json`, JSON.stringify({ passed: true, results, limitations: ['Synthetic GPS, no field route', 'No physical speaker listening or TalkBack audit', 'No real OAuth sign-in'] }, null, 2));
} catch (error) {
  try { screenshot('failure'); writeFileSync(`${out}/failure.xml`, await nativeTree()); } catch {}
  writeFileSync(`${out}/results.json`, JSON.stringify({ passed: false, results, error: error.stack }, null, 2));
  console.error(error); process.exitCode = 1;
} finally {
  if (restoreLocation === 'true' || restoreLocation === 'false') {
    try { adb('shell', 'cmd', 'location', 'set-location-enabled', restoreLocation); } catch {}
  }
  // Stop only the separate validation application, without touching the user's normal app.
  try { adb('shell', 'am', 'force-stop', pkg); } catch {}
  if (device) await Promise.race([device.close(), delay(5000)]).catch(() => {});
}
// Some emulator WebView versions retain a CDP socket after device.close().
process.exit(process.exitCode ?? 0);
