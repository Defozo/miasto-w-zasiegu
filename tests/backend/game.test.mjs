import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { registerGameRoutes } from '../../server/game.mjs';

const fixtures = [];
after(async () => { for (const fixture of fixtures) await fixture.close(); });
async function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE reports(id TEXT PRIMARY KEY,user_id TEXT,kind TEXT,lon REAL,lat REAL,description TEXT,width_cm REAL,status TEXT,created_at TEXT)');
  const places = Array.from({ length: 9 }, (_, index) => ({ id: `test:${index}`, name: `Testowy punkt ${index}`, coordinates: [19.938 + index * .006, 50.061], address: 'Wyłącznie dane testowe', sourceUrl: 'https://example.invalid' }));
  let timestamp = Date.parse('2026-10-03T12:00:00Z');
  const store = { places: () => places, place: id => places.find(place => place.id === id) };
  const app = express(); app.use(express.json());
  registerGameRoutes(app, { db, store, now: () => timestamp, getUser: req => req.get('x-test-user') ? { id: req.get('x-test-user') } : null });
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: { code: error.code, message: error.message } }));
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const target = {
    db, places,
    advance: (seconds = 100) => { timestamp += seconds * 1000; },
    report(overrides = {}) {
      const report = { id: randomUUID(), user: 'alice', kind: 'width', coordinates: places[0].coordinates,
        description: 'Zmierzone przewężenie przy południowym wejściu pomiędzy murem i betonowym słupkiem.', widthCm: 85, status: 'active', createdAt: new Date(timestamp).toISOString(), ...overrides };
      db.prepare('INSERT INTO reports VALUES(?,?,?,?,?,?,?,?,?)').run(report.id, report.user, report.kind, ...report.coordinates, report.description, report.widthCm, report.status, report.createdAt);
      return report;
    },
    async request(path, body, user = 'alice') {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/game${path}`, {
        method: body === undefined ? 'GET' : 'POST', headers: { ...(user ? { 'x-test-user': user } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json() };
    },
    async close() { await new Promise(resolve => server.close(resolve)); db.close(); },
  };
  fixtures.push(target); return target;
}

test('game guest can read but cannot claim or spend; another user cannot claim report', async () => {
  const f = await fixture(), report = f.report();
  const guest = await f.request('/state', undefined, null);
  assert.equal(guest.body.authenticated, false); assert.equal(guest.body.earned, 0);
  assert.equal((await f.request('/claim', { reportId: report.id, missionId: 'width:test:0' }, null)).status, 401);
  assert.equal((await f.request('/decorate', { itemId: 'flowers', slot: 0 }, null)).status, 401);
  assert.equal((await f.request('/claim', { reportId: report.id, missionId: 'width:test:0' }, 'bob')).status, 403);
  assert.equal(f.db.prepare('SELECT count(*) AS total FROM game_claims').get().total, 0);
});

test('game rewards one observation once, replay is idempotent, progress is user specific', async () => {
  const f = await fixture(), report = f.report();
  const claim = { reportId: report.id, missionId: 'width:test:0', points: 999999, userId: 'bob' };
  const first = await f.request('/claim', claim);
  assert.equal(first.status, 201); assert.equal(first.body.awarded, 20); assert.equal(first.body.state.balance, 20);
  const repeat = await f.request('/claim', claim);
  assert.equal(repeat.status, 200); assert.equal(repeat.body.awarded, 0); assert.equal(repeat.body.alreadyClaimed, true);
  assert.equal((await f.request('/state')).body.earned, 20);
  assert.equal((await f.request('/state', undefined, 'bob')).body.earned, 0);
  assert.equal((await f.request('/claim', { reportId: report.id, missionId: 'surface:test:0' })).status, 409);
});

test('game rejects absent, anonymous, resolved, stale and future observations', async () => {
  const f = await fixture();
  assert.equal((await f.request('/claim', { reportId: 'missing', missionId: 'width:test:0' })).status, 404);
  for (const [overrides, status] of [[{ user: null }, 403], [{ status: 'resolved' }, 409], [{ createdAt: '2020-01-01T00:00:00Z' }, 409], [{ createdAt: '2030-01-01T00:00:00Z' }, 409]]) {
    const report = f.report(overrides);
    assert.equal((await f.request('/claim', { reportId: report.id, missionId: 'width:test:0' })).status, status);
  }
});

test('game validates mission, actual location, useful description and width measurement', async () => {
  const f = await fixture();
  const report = f.report();
  assert.equal((await f.request('/claim', { reportId: report.id, missionId: 'invented:test:0' })).status, 400);
  assert.equal((await f.request('/claim', { reportId: report.id, missionId: 'width:not-a-place' })).status, 400);
  assert.equal((await f.request('/claim', { reportId: report.id, missionId: 'surface:test:0' })).body.error.code, 'MISSION_KIND_MISMATCH');
  assert.equal((await f.request('/claim', { reportId: report.id, missionId: 'width:test:5' })).body.error.code, 'MISSION_LOCATION_MISMATCH');
  for (const overrides of [{ description: 'Krótki opis' }, { description: 'próg próg próg próg próg próg próg próg próg próg' }, { widthCm: null }, { widthCm: 999 }]) {
    const bad = f.report(overrides);
    assert.equal((await f.request('/claim', { reportId: bad.id, missionId: 'width:test:0' })).status, 400);
  }
  assert.equal((await f.request('/state')).body.earned, 0);
});

test('game blocks duplicate mission, nearby duplicate and copied description under new IDs', async () => {
  const f = await fixture(), original = f.report();
  await f.request('/claim', { reportId: original.id, missionId: 'width:test:0' });
  f.advance();
  const sameMission = f.report({ description: 'Inny opis tego samego przewężenia bez dodatkowej obserwacji przy wejściu.' });
  assert.equal((await f.request('/claim', { reportId: sameMission.id, missionId: 'width:test:0' })).body.error.code, 'DUPLICATE_OBSERVATION');
  const copied = f.report({ coordinates: f.places[1].coordinates });
  assert.equal((await f.request('/claim', { reportId: copied.id, missionId: 'width:test:1' })).body.error.code, 'DUPLICATE_OBSERVATION');
  f.places.push({ ...f.places[0], id: 'nearby', coordinates: [19.9381, 50.061] });
  const nearby = f.report({ coordinates: [19.9381, 50.061], description: 'Jeszcze inne słowa opisujące pobliskie zwężenie obok murowanego narożnika budynku.' });
  assert.equal((await f.request('/claim', { reportId: nearby.id, missionId: 'width:nearby' })).body.error.code, 'DUPLICATE_OBSERVATION');
  assert.equal((await f.request('/state')).body.observations, 1);
});

test('game awards variety once without streak and rate limits rapid repeated submissions', async () => {
  const f = await fixture();
  const first = f.report(); await f.request('/claim', { reportId: first.id, missionId: 'width:test:0' });
  const surface = f.report({ kind: 'surface', description: 'Popękane płyty chodnikowe obok wejścia do budynku od strony ulicy.' });
  assert.equal((await f.request('/claim', { reportId: surface.id, missionId: 'surface:test:0' })).body.error.code, 'GAME_TOO_FAST');
  f.advance(); assert.equal((await f.request('/claim', { reportId: surface.id, missionId: 'surface:test:0' })).body.awarded, 15);
  f.advance();
  const kerb = f.report({ kind: 'kerb', description: 'Wysoki uskok przy przejściu dla pieszych od strony zachodniej pierzei.' });
  const result = await f.request('/claim', { reportId: kerb.id, missionId: 'kerb:test:0' });
  assert.equal(result.body.varietyBonus, 10); assert.equal(result.body.awarded, 25); assert.equal(result.body.state.earned, 60);
  const missions = (await f.request('/missions')).body.missions;
  assert(!missions.some(item => item.targetId === 'test:0' && ['width', 'surface', 'kerb'].includes(item.kind)));
  assert(missions.some(item => item.targetId === 'test:0' && item.source === 'observation'));
});

test('garden only spends server earned sparks, purchase once, placement can change free', async () => {
  const f = await fixture();
  assert.equal((await f.request('/decorate', { itemId: 'tree', slot: 0, balance: 9999 })).body.error.code, 'NOT_ENOUGH_SPARKS');
  const report = f.report(); await f.request('/claim', { reportId: report.id, missionId: 'width:test:0' });
  const first = await f.request('/decorate', { itemId: 'flowers', slot: 0 });
  assert.equal(first.status, 200); assert.equal(first.body.state.spent, 15); assert.equal(first.body.state.balance, 5);
  const moved = await f.request('/decorate', { itemId: 'flowers', slot: 2 });
  assert.equal(moved.body.state.spent, 15); assert.equal(moved.body.state.decorations.length, 2);
  assert.equal((await f.request('/decorate', { itemId: 'lantern', slot: 1 })).status, 409);
  for (const body of [{ itemId: 'flowers', slot: 8 }, { itemId: 'injected', slot: 0 }, { itemId: 'flowers', slot: '0' }]) assert.equal((await f.request('/decorate', body)).status, 400);
  assert.equal((await f.request('/state')).body.balance, 5);
});

test('game rejects account changes and limits claims to five in rolling day', async () => {
  const f = await fixture(), report = f.report();
  assert.equal((await f.request('/claim', { reportId: report.id, missionId: 'width:test:0', expectedUserId: 'bob' })).status, 409);
  assert.equal((await f.request('/decorate', { itemId: 'flowers', slot: 0, expectedUserId: 'bob' })).status, 409);
  for (let index = 0; index < 6; index++) {
    const item = f.report({ coordinates: f.places[index].coordinates, description: `Pomiar zwężenia numer ${index} między słupkiem i murem w okolicy wejścia do budynku.` });
    const result = await f.request('/claim', { reportId: item.id, missionId: `width:test:${index}`, expectedUserId: 'alice' });
    assert.equal(result.status, index < 5 ? 201 : 429);
    if (index === 5) assert.equal(result.body.error.code, 'GAME_DAILY_LIMIT');
    f.advance();
  }
  assert.equal((await f.request('/state')).body.observations, 5);
});

test('mission area search validates coordinates and orders by actual location', async () => {
  const f = await fixture();
  const result = await f.request('/missions?lon=19.986&lat=50.061');
  assert.equal(result.status, 200); assert.equal(result.body.missions[0].target.id, 'test:8');
  assert.equal((await f.request('/missions?lon=invalid&lat=50.061')).status, 400);
  assert.equal((await f.request('/missions?lon=19.986')).status, 400);
  assert.equal((await f.request('/missions?lon=0&lat=0')).status, 400);
});
