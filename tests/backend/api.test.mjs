import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { app as defaultApp, createApp } from '../../server/index.mjs';

after(() => defaultApp.locals.store.close());
const START = [19.93931, 50.06218], END = [19.94123, 50.06464];
const servers = [];
after(async () => { for (const s of servers) await s.close(); });

async function serve(options = {}) {
  const app = createApp({ dbPath: ':memory:', ...options });
  const listener = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  let closed = false;
  const service = { app, base: `http://127.0.0.1:${listener.address().port}`, async close() {
    if (closed) return;
    closed = true;
    await new Promise(resolve => listener.close(resolve)); app.locals.store.close();
  } };
  servers.push(service);
  return service;
}
async function request(service, path, body) {
  const response = await fetch(service.base + path, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
function mockRoute(coordinates) {
  return new Response(JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature',
    geometry: { type: 'LineString', coordinates }, properties: { summary: { distance: 306, duration: 220 },
      segments: [{ steps: [{ instruction: 'Jedź prosto.', distance: 306, way_points: [0, coordinates.length - 1] }] }] } }],
    metadata: { engine: { version: 'test', osm_date: '2026-10-01' } } }), { status: 200 });
}

test('real POIs, diacritic search, catalog conflicts stay visible', async () => {
  const s = await serve();
  const places = await request(s, '/api/places?q=toaleta&category=toilet&limit=3');
  assert.equal(places.status, 200); assert(places.body.total > 0); assert(places.body.places.length <= 3);
  for (const p of places.body.places) {
    assert.equal(p.category, 'toilet'); assert.equal(p.verifiedAt, null); assert.match(p.sourceUrl, /^https:\/\/www.openstreetmap.org\/(node|way)\/\d+$/);
    const one = await request(s, `/api/places/${p.id}`); assert.equal(one.body.id, p.id);
  }
  const chairs = (await request(s, '/api/wheelchairs')).body;
  assert.equal(chairs.wheelchairs.length, 13);
  assert.equal(chairs.wheelchairs.filter(c => c.status === 'conflict').length, 2);
  assert(chairs.wheelchairs.filter(c => c.status !== 'match').every(c => c.widthCm === null));
  assert.equal((await request(s, '/api/places?limit=100000')).status, 400);
  for (const name of ['Sukiennice', 'Wawel']) {
    const result = await request(s, `/api/places?q=${name}&limit=1`);
    assert.equal(result.body.places[0].name, name);
    assert.equal(result.body.places[0].coordinateKind, 'representative-center');
    assert.equal(result.body.places[0].verifiedAt, null);
    assert.match(result.body.places[0].access.entranceNotes, /nie wejście/);
  }
});

test('rejects malformed coordinates/profile and bounds descriptions before calling ORS', async () => {
  let calls = 0; const s = await serve({ fetchImpl: async () => { calls++; return mockRoute([START, END]); } });
  for (const body of [null, {}, { start: [0, 0], end: END }, { start: START, end: END, profile: { widthCm: '90' } },
    { start: START, end: END, profile: { maxIncline: -1 } }, { start: START, end: END, profile: { maxIncline: 2.5 } },
    { start: START, end: END, avoidReports: 'false' }]) assert.equal((await request(s, '/api/route', body)).status, 400);
  assert.equal(calls, 0);
  assert.equal((await request(s, '/api/reports', { kind: 'invented', coordinates: START, description: 'Test' })).status, 400);
  assert.equal((await request(s, '/api/reports', { kind: 'width', coordinates: START, description: 'Test', widthCm: -5 })).status, 400);
  assert.equal((await request(s, '/api/reports', { kind: 'obstacle', coordinates: START, description: 'x'.repeat(900) })).status, 400);
});

test('reports persist through database reopen; only active reports can be resolved', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cracow-backend-'));
  const dbPath = join(dir, 'test.sqlite');
  let a, b;
  try {
    a = await serve({ dbPath });
    const added = await request(a, '/api/reports', { kind: 'obstacle', coordinates: START, description: 'Kontrolowany raport testowy' });
    assert.equal(added.status, 201); assert.equal(added.body.status, 'active'); assert.equal(added.body.stale, false);
    await a.close();
    b = await serve({ dbPath });
    assert.equal((await request(b, '/api/reports')).body.reports[0].id, added.body.id);
    const resolved = await request(b, `/api/reports/${added.body.id}/resolve`, {});
    assert.equal(resolved.body.status, 'resolved'); assert(resolved.body.resolvedAt);
    const second = await request(b, `/api/reports/${added.body.id}/resolve`, {});
    assert.equal(second.status, 409); assert.equal(second.body.error.code, 'REPORT_ALREADY_RESOLVED');
    assert.equal((await request(b, '/api/reports')).body.reports[0].resolvedAt, resolved.body.resolvedAt);
    const community = (await request(b, '/api/community')).body;
    assert.equal(community.stats.resolvedReports, 1);
  } finally { await a?.close(); await b?.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('route maps profile into ORS units and leaves imprecise legacy reports for review', async () => {
  let sent;
  const s = await serve({ fetchImpl: async (_url, options) => { sent = JSON.parse(options.body); return mockRoute([START, END]); } });
  const fresh = s.app.locals.store.addReport({ kind: 'obstacle', coordinates: [19.94, 50.063], description: 'Przeszkoda testowa' });
  const old = s.app.locals.store.addReport({ kind: 'lift', coordinates: END, description: 'Stare zgłoszenie testowe' });
  s.app.locals.store.db.prepare('UPDATE reports SET created_at=? WHERE id=?').run('2000-01-01T00:00:00Z', old.id);
  const response = await request(s, '/api/route', { start: START, end: END, profile: { widthCm: 75, maxIncline: 4, maxKerbCm: 3, avoidUnpaved: true } });
  assert.equal(response.status, 200);
  assert.equal(sent.options.profile_params.restrictions.minimum_width, 0.75);
  assert.equal(sent.options.profile_params.restrictions.maximum_sloped_kerb, 0.03);
  assert.equal(sent.options.profile_params.restrictions.surface_type, 'cobblestone');
  assert.equal(sent.options.profile_params.restrictions.track_type, 'grade2');
  assert.equal(sent.options.profile_params.restrictions.smoothness_type, undefined);
  assert.deepEqual(response.body.source.reportsAvoided, []);
  assert.equal(sent.options.avoid_polygons, undefined);
  assert.equal(fresh.locationAccuracy, 'approximate');
  assert.deepEqual(response.body.steps[0].wayPoints, [0, 1]);
  assert.equal(response.body.source.fieldVerified, false);
  await request(s, '/api/route', { start: START, end: END, avoidReports: false });
  assert.equal(sent.options.avoid_polygons, undefined);
});

test('ORS failures and no-route are explicit with no invented fallback', async () => {
  for (const [fetchImpl, expected, code] of [
    [async () => { throw new TypeError('fetch failed'); }, 503, 'ROUTING_UNAVAILABLE'],
    [async () => new Response(JSON.stringify({ error: { code: 2010 } }), { status: 404 }), 422, 'NO_ROUTE'],
    [async () => new Response('not json', { status: 200 }), 502, 'ROUTING_BAD_RESPONSE'],
  ]) {
    const s = await serve({ fetchImpl });
    const r = await request(s, '/api/route', { start: START, end: END });
    assert.equal(r.status, expected); assert.equal(r.body.error.code, code); assert.equal(r.body.geometry, undefined);
  }
});

test('missing chair width remains unknown; width reports depend on both measurements', async () => {
  let sent;
  const s = await serve({ fetchImpl: async (_url, options) => { sent = JSON.parse(options.body); return mockRoute([START, END]); } });
  const narrow = s.app.locals.store.addReport({ kind: 'width', coordinates: START, description: 'Przejście 65 cm', widthCm: 65 });
  s.app.locals.store.addReport({ kind: 'width', coordinates: END, description: 'Przejście 100 cm', widthCm: 100 });
  s.app.locals.store.addReport({ kind: 'width', coordinates: END, description: 'Brak pomiaru szerokości' });
  const unknown = await request(s, '/api/route', { start: START, end: END });
  assert.equal(unknown.status, 200); assert.equal(unknown.body.source.profileApplied.widthCm, null);
  assert.equal(sent.options.profile_params.restrictions.minimum_width, undefined);
  assert.equal(sent.options.avoid_polygons, undefined); assert.deepEqual(unknown.body.source.reportsAvoided, []);
  assert(unknown.body.warnings.some(w => w.includes('Nie podano szerokości wózka') && w.includes('nie omija automatycznie zgłoszonych zwężeń')));
  const measured = await request(s, '/api/route', { start: START, end: END, profile: { widthCm: 70 } });
  assert.deepEqual(measured.body.source.reportsAvoided, []);
  assert.equal(sent.options.avoid_polygons, undefined);
  assert.equal(narrow.locationAccuracy, 'approximate');
});

test('live ORS: baseline and reported obstacle detour, then resolve restores route', { skip: process.env.RUN_ORS_TESTS !== '1' }, async () => {
  const s = await serve();
  const health = await request(s, '/api/health'); assert.equal(health.body.routing, 'ready');
  const base = await request(s, '/api/route', { start: START, end: END });
  assert.equal(base.status, 200, JSON.stringify(base.body)); assert(base.body.distanceM > 0);
  assert.equal(base.body.geometry.type, 'LineString'); assert(base.body.steps.length > 0);
  const obstacle = await request(s, '/api/reports', { kind: 'obstacle', locationAccuracy: 'precise', coordinates: [19.939976, 50.0630515], description: 'Syntetyczna przeszkoda tylko w bazie testowej' });
  const detour = await request(s, '/api/route', { start: START, end: END });
  assert.equal(detour.status, 200, JSON.stringify(detour.body)); assert(detour.body.distanceM > base.body.distanceM);
  assert.notDeepEqual(detour.body.geometry, base.body.geometry);
  await request(s, `/api/reports/${obstacle.body.id}/resolve`, {});
  const restored = await request(s, '/api/route', { start: START, end: END });
  assert.equal(restored.body.distanceM, base.body.distanceM);
  const paved = await request(s, '/api/route', { start: START, end: END, profile: { avoidUnpaved: true } });
  assert([200, 422].includes(paved.status), JSON.stringify(paved.body));
  console.log(JSON.stringify({ liveORS: { baselineM: base.body.distanceM, detourM: detour.body.distanceM, restoredM: restored.body.distanceM, pavedStatus: paved.status } }));
});
