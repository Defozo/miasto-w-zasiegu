import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { app as defaultApp, createApp } from '../../server/index.mjs';
import { createAuth as localTestAuth } from '../helpers/local-auth.mjs';

after(() => defaultApp.locals.store.close());
const START = [19.93931, 50.06218], VIA = [19.939976, 50.0630515], END = [19.94123, 50.06464];
const PROFILE = { mobility: 'manual', widthCm: '', maxIncline: '6', maxKerbCm: '6', avoidUnpaved: false };
const PASSWORD = 'local-test-password-only';
const opened = [];
after(async () => { for (const service of opened) await service.close(); });
async function serve(options = {}) {
  const app = createApp({ dbPath: ':memory:', authFactory: localTestAuth, ...options });
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  let closed = false;
  const service = { app, base: `http://127.0.0.1:${server.address().port}`, async close() {
    if (closed) return; closed = true;
    await new Promise(resolve => server.close(resolve)); app.locals.store.close();
  } };
  opened.push(service); return service;
}
async function call(s, path, { method = 'GET', body, token, headers = {} } = {}) {
  const response = await fetch(s.base + path, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json(), headers: response.headers };
}
async function register(s, name = 'alice') {
  const result = await call(s, '/api/auth/register', { method: 'POST', body: { email: `${name}@example.test`, password: PASSWORD, displayName: name } });
  assert.equal(result.status, 201); return result;
}
const trip = (id, extra = {}) => ({ routeId: id, distanceM: 1000, durationS: 1000, completed: true, feedback: 'passable', profile: PROFILE, consent: true, ...extra });
function mockedRoute(points) {
  return new Response(JSON.stringify({ features: [{ geometry: { type: 'LineString', coordinates: points }, properties: {
    summary: { distance: 1000, duration: 800 }, way_points: points.map((_, index) => index),
    segments: points.slice(1).map((_, index) => ({ steps: [{ instruction: 'Jedź prosto.', distance: 500, way_points: [index, index + 1] }] }))
  } }], metadata: { engine: { version: 'test' } } }));
}

test('actual local addresses preserve Polish text and exact house number; POI Wawel remains approximate', async () => {
  const s = await serve();
  for (const query of ['Długa 12', 'ul. Dluga 12', 'Rynek Główny 1']) {
    const result = await call(s, `/api/locations?q=${encodeURIComponent(query)}&limit=8`);
    assert.equal(result.status, 200); assert(result.body.locations.length > 0, query);
    const first = result.body.locations[0]; assert.equal(first.kind, 'address'); assert.equal(first.precision, 'address');
    assert.match(first.sourceUrl, /^https:\/\/www.openstreetmap.org\/(node|way)\/\d+$/);
    if (query.includes('12')) { assert.match(first.label, /Długa 12(?:,|$)/); assert(!first.label.includes('120')); }
    else assert.match(first.label, /Rynek Główny 1(?:,|$)/);
    assert(first.coordinates[0] > 19.75 && first.coordinates[0] < 20.25);
  }
  const wawel = (await call(s, '/api/locations?q=Wawel')).body.locations.find(location => location.label === 'Wawel' && location.kind === 'place');
  assert(wawel); assert.equal(wawel.precision, 'approximate');
  const rynek = (await call(s, `/api/locations?q=${encodeURIComponent('Rynek Główny 1')}&limit=20`)).body.locations;
  const expected = [
    ['address-osm-node-3789279757', 'Noworolski', [19.9374676, 50.0615455]],
    ['address-osm-way-25122842', 'Wieża Ratuszowa', [19.9364146, 50.0614744]],
    ['address-osm-node-1332080339', 'Rynek Podziemny', [19.9377768, 50.062005]],
  ];
  assert.equal(rynek.length, 3);
  for (const [id, name, point] of expected) {
    const result = rynek.find(location => location.id === id);
    assert(result, `${name} must remain separately selectable`);
    assert.equal(result.label, `Rynek Główny 1, Kraków · ${name}`);
    assert.equal(result.addressLabel, 'Rynek Główny 1, Kraków');
    assert.deepEqual(result.coordinates, point);
    assert.match(result.sourceLabel, /wejście niezweryfikowane/);
  }
  const dluga = (await call(s, `/api/locations?q=${encodeURIComponent('Długa 12 Kraków')}`)).body.locations;
  assert.equal(dluga.length, 2);
  assert.equal(dluga.find(p => p.id === 'address-osm-node-10265742689').label, 'Długa 12, Kraków · Fornir');
  const anonymous = dluga.find(p => p.id === 'address-osm-node-1917766676');
  assert.equal(anonymous.label, 'Długa 12, Kraków · punkt adresowy');
  assert.equal(anonymous.disambiguationHint, 'Inny punkt tego samego adresu, około 19 m w linii prostej od Fornir. Wejście niezweryfikowane.');
  assert.equal(anonymous.coordinateKind, 'osm-node');
  assert.deepEqual(anonymous.coordinates, [19.9386605, 50.0671241]);
  assert.equal((await call(s, '/api/locations?q=Dluga&limit=1000')).status, 400);
});

test('scrypt auth, cookie and Bearer, profile CAS and ownership isolate users across restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cracow-auth-')), dbPath = join(dir, 'test.sqlite');
  let s, reopened;
  try {
    s = await serve({ dbPath });
    assert.equal((await call(s, '/api/auth/me')).body.user, null);
    const alice = await register(s), bob = await register(s, 'bob');
    const token = alice.body.token, cookie = alice.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/); assert.match(cookie, /Path=\/api/);
    assert.equal((await call(s, '/api/auth/me', { headers: { Cookie: cookie.split(';')[0] } })).body.user.id, alice.body.user.id);
    assert.equal((await call(s, '/api/auth/me', { token })).body.user.id, alice.body.user.id);
    const stored = s.app.locals.context.db.prepare('SELECT password_hash FROM users WHERE id=?').get(alice.body.user.id);
    assert.match(stored.password_hash, /^scrypt\$/); assert(!stored.password_hash.includes(PASSWORD));
    assert(!s.app.locals.context.db.prepare('SELECT token_hash FROM sessions').all().some(row => row.token_hash === token));
    const saved = await call(s, '/api/profile', { method: 'PUT', token, body: { profile: PROFILE, expectedVersion: 0 } });
    assert.equal(saved.status, 200); assert.equal(saved.body.profileVersion, 1);
    const conflict = await call(s, '/api/profile', { method: 'PUT', token, body: { profile: { ...PROFILE, widthCm: '90' }, expectedVersion: 0 } });
    assert.equal(conflict.status, 409); assert.equal(conflict.body.error.code, 'PROFILE_CONFLICT'); assert.equal(conflict.body.error.details.profileVersion, 1);
    assert.equal((await call(s, '/api/auth/me', { token: bob.body.token })).body.profile, null);
    const report = await call(s, '/api/reports', { method: 'POST', token, body: { kind: 'width', coordinates: START, description: 'Test ownership', userId: bob.body.user.id } });
    assert.equal(report.body.isMine, true); assert.equal(report.body.userId, undefined);
    assert.equal(s.app.locals.store.getReport(report.body.id).userId, alice.body.user.id);
    assert.equal((await call(s, `/api/reports/${report.body.id}/resolve`, { method: 'POST', body: {}, token: bob.body.token })).status, 403);
    assert.equal((await call(s, `/api/reports/${report.body.id}/resolve`, { method: 'POST', body: {} })).status, 403);
    assert.equal((await call(s, '/api/reports', { token: bob.body.token })).body.reports[0].isMine, false);
    await s.close(); reopened = await serve({ dbPath });
    const me = await call(reopened, '/api/auth/me', { token }); assert.deepEqual(me.body.profile, PROFILE); assert.equal(me.body.profileVersion, 1);
    assert.equal((await call(reopened, `/api/reports/${report.body.id}/resolve`, { method: 'POST', body: {}, token })).status, 200);
    assert.equal((await call(reopened, '/api/auth/login', { method: 'POST', body: { email: 'alice@example.test', password: 'incorrect' } })).status, 401);
    const login = await call(reopened, '/api/auth/login', { method: 'POST', body: { email: 'ALICE@example.test', password: PASSWORD } });
    assert.equal(login.status, 200); assert.deepEqual(login.body.profile, PROFILE);
    await call(reopened, '/api/auth/logout', { method: 'POST', token });
    assert.equal((await call(reopened, '/api/auth/me', { token })).body.user, null);
    assert.equal((await call(reopened, '/api/auth/me', { token: login.body.token })).body.user.id, alice.body.user.id);
  } finally { await s?.close(); await reopened?.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('shared-cookie account switch rejects stale mutations even at the same profile version', async () => {
  let routeCalls = 0;
  const s = await serve({ fetchImpl: async (_url, options) => { routeCalls++; return mockedRoute(JSON.parse(options.body).coordinates); } });
  const alice = await register(s), bob = await register(s, 'bob');
  const headers = { Cookie: bob.headers.get('set-cookie').split(';')[0] };
  assert.equal(alice.body.profileVersion, bob.body.profileVersion);
  // Tab A still displays Alice; another tab has replaced the browser cookie with Bob's session.
  const staleProfile = await call(s, '/api/profile', { method: 'PUT', headers,
    body: { expectedUserId: alice.body.user.id, expectedVersion: alice.body.profileVersion, profile: PROFILE } });
  assert.equal(staleProfile.status, 409); assert.equal(staleProfile.body.error.code, 'ACCOUNT_CHANGED');
  const unchanged = (await call(s, '/api/auth/me', { headers })).body;
  assert.equal(unchanged.user.id, bob.body.user.id); assert.equal(unchanged.profile, null); assert.equal(unchanged.profileVersion, 0);
  const staleRoute = await call(s, '/api/route', { method: 'POST', headers,
    body: { expectedUserId: alice.body.user.id, start: START, end: END } });
  assert.equal(staleRoute.status, 409); assert.equal(routeCalls, 0);
  const staleLogout = await call(s, '/api/auth/logout', { method: 'POST', headers, body: { expectedUserId: alice.body.user.id } });
  assert.equal(staleLogout.status, 409); assert.equal((await call(s, '/api/auth/me', { headers })).body.user.id, bob.body.user.id);
  assert.equal((await call(s, '/api/trips/me', { method: 'DELETE', headers, body: { expectedUserId: alice.body.user.id } })).status, 409);
  const staleGuest = await call(s, '/api/reports', { method: 'POST', headers,
    body: { expectedUserId: null, kind: 'width', coordinates: START, description: 'Not to be attributed to Bob' } });
  assert.equal(staleGuest.status, 409); assert.equal(s.app.locals.store.reports().length, 0);
  const correctProfile = await call(s, '/api/profile', { method: 'PUT', headers,
    body: { expectedUserId: bob.body.user.id, expectedVersion: 0, profile: PROFILE } });
  assert.equal(correctProfile.status, 200); assert.equal(correctProfile.body.profileVersion, 1);
  // Android remains compatible when a token-bound request omits the extra browser guard.
  assert.equal((await call(s, '/api/profile', { method: 'PUT', token: alice.body.token,
    body: { expectedVersion: 0, profile: { ...PROFILE, mobility: 'power' } } })).status, 200);
  assert.equal((await call(s, '/api/auth/logout', { method: 'POST', headers, body: { expectedUserId: bob.body.user.id } })).status, 200);
  const guestRoute = await call(s, '/api/route', { method: 'POST', body: { expectedUserId: null, start: START, end: END } });
  assert.equal(guestRoute.status, 200); assert.equal(routeCalls, 1);
});

test('auth validation, login rate bound and mutation Origin protection', async () => {
  const s = await serve();
  assert.equal((await call(s, '/api/auth/register', { method: 'POST', body: { email: 'test@example.test', password: 'short', displayName: 'test' } })).status, 400);
  const account = await register(s);
  assert.equal((await call(s, '/api/profile', { method: 'PUT', token: account.body.token, body: { expectedVersion: 0, profile: { ...PROFILE, maxIncline: '2.5' } } })).status, 400);
  for (const method of ['POST', 'PUT', 'DELETE']) assert.equal((await call(s, '/api/profile', { method, body: {}, headers: { Origin: 'https://unrelated.example' } })).status, 403);
  for (let i = 0; i < 12; i++) assert.equal((await call(s, '/api/auth/login', { method: 'POST', body: { email: 'nobody@example.test', password: 'incorrect' } })).status, 401);
  assert.equal((await call(s, '/api/auth/login', { method: 'POST', body: { email: 'nobody@example.test', password: 'incorrect' } })).status, 429);
});

test('ordered via points reach ORS unchanged with individual snap bounds, limits reject before ORS', async () => {
  let sent, calls = 0;
  const s = await serve({ fetchImpl: async (_url, options) => { calls++; sent = JSON.parse(options.body); return mockedRoute(sent.coordinates); } });
  const result = await call(s, '/api/route', { method: 'POST', body: { start: START, end: END, waypoints: [VIA] } });
  assert.equal(result.status, 200); assert.deepEqual(sent.coordinates, [START, VIA, END]); assert.deepEqual(sent.radiuses, [30, 30, 30]);
  assert.deepEqual(result.body.source.snappedCoordinates, [START, VIA, END]); assert.deepEqual(result.body.steps[1].wayPoints, [1, 2]);
  assert.equal(result.body.source.durationModel, 'ors'); assert.match(result.body.routeId, /^[a-f0-9-]+$/);
  for (const waypoints of [Array(6).fill(VIA), [[0, 0]], 'invalid']) assert.equal((await call(s, '/api/route', { method: 'POST', body: { start: START, end: END, waypoints } })).status, 400);
  assert.equal(calls, 1);
});

test('opt-in trips calibrate only private same-profile ETA; quality, outliers, duplicate and deletion guards', async () => {
  const s = await serve({ fetchImpl: async (_url, options) => mockedRoute(JSON.parse(options.body).coordinates) });
  const alice = (await register(s)).body, bob = (await register(s, 'bob')).body;
  assert.equal((await call(s, '/api/trips', { method: 'POST', body: trip('guest') })).status, 401);
  assert.equal((await call(s, '/api/trips', { method: 'POST', token: alice.token, body: trip('no-consent', { consent: false }) })).status, 400);
  await call(s, '/api/profile', { method: 'PUT', token: alice.token, body: { expectedVersion: 0, profile: PROFILE } });
  for (let i = 0; i < 3; i++) {
    const saved = await call(s, '/api/trips', { method: 'POST', token: alice.token, body: trip(`trip-${i}`) });
    assert.equal(saved.status, 201); assert.equal(saved.body.learning.ready, i === 2);
  }
  assert.equal((await call(s, '/api/trips', { method: 'POST', token: alice.token, body: trip('trip-0') })).status, 409);
  for (const [id, extra] of [['blocked', { feedback: 'blocked' }], ['short', { distanceM: 10 }], ['incomplete', { completed: false }]]) {
    const result = await call(s, '/api/trips', { method: 'POST', token: alice.token, body: trip(id, extra) });
    assert.equal(result.body.trip.eligibleForLearning, false); assert.equal(result.body.learning.sampleCount, 3);
  }
  await call(s, '/api/trips', { method: 'POST', token: alice.token, body: trip('outlier', { durationS: 9000 }) });
  const model = (await call(s, '/api/learning/me', { token: alice.token })).body;
  assert.equal(model.sampleCount, 3); assert.equal(model.outliersExcluded, 1); assert.equal(model.secondsPerMeter, 1);
  await call(s, '/api/trips', { method: 'POST', token: bob.token, body: trip('bob-trip') });
  assert.equal((await call(s, '/api/learning/me', { token: bob.token })).body.ready, false);
  const body = { start: START, end: END, profile: { mobility: 'manual' } };
  const guest = (await call(s, '/api/route', { method: 'POST', body })).body;
  const personal = (await call(s, '/api/route', { method: 'POST', body, token: alice.token })).body;
  assert.equal(personal.durationS, 1000); assert.equal(personal.source.baseDurationS, 800); assert.equal(personal.source.durationModel, 'personal-median-ewma-v1');
  assert.deepEqual(personal.geometry, guest.geometry); assert(guest.warnings.every(w => personal.warnings.includes(w)));
  const power = (await call(s, '/api/route', { method: 'POST', body: { ...body, profile: { mobility: 'power' } }, token: alice.token })).body;
  assert.equal(power.source.durationModel, 'ors'); assert.equal(power.durationS, 800);
  await call(s, '/api/learning/me', { method: 'DELETE', token: alice.token });
  assert.equal((await call(s, '/api/learning/me', { token: alice.token })).body.ready, false);
  assert.equal((await call(s, '/api/trips/me', { token: alice.token })).body.total, 7);
  await call(s, '/api/trips/me', { method: 'DELETE', token: alice.token });
  assert.equal((await call(s, '/api/trips/me', { token: alice.token })).body.total, 0);
  assert.equal((await call(s, '/api/trips/me', { token: bob.token })).body.total, 1);
});

test('live ORS computes ordered intermediate stop with global geometry step indices', { skip: process.env.RUN_ORS_TESTS !== '1' }, async () => {
  const s = await serve();
  const result = await call(s, '/api/route', { method: 'POST', body: { start: START, end: END, waypoints: [VIA], avoidReports: false } });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  const route = result.body; assert.equal(route.source.snappedCoordinates.length, 3); assert(route.source.snapDistancesM.every(d => d <= 31));
  assert(route.steps.every(step => step.wayPoints[0] >= 0 && step.wayPoints[1] < route.geometry.coordinates.length));
  assert(route.steps.length >= 2); assert(route.distanceM > 0);
  console.log(JSON.stringify({ liveVia: { distanceM: route.distanceM, snapDistancesM: route.source.snapDistancesM, steps: route.steps.length } }));
});
