import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { unlinkSync } from 'node:fs';
import { registerObservationRoutes } from '../../server/observations.mjs';
import { registerGameRoutes } from '../../server/game.mjs';

const fixtures = [], files = [];
after(async () => { for (const f of fixtures) await f.close(); for (const file of files) unlinkSync(file); });
async function fixture({ filename = ':memory:', game = false, start = Date.parse('2026-10-03T12:00:00Z') } = {}) {
  const db = new DatabaseSync(filename); let timestamp = start, closed = false;
  const app = express(); app.use(express.json());
  const getUser = req => req.get('x-test-user') ? { id: req.get('x-test-user') } : null;
  const places = Array.from({ length: 12 }, (_, index) => ({ id: `positive:${index}`, name: `Wyłącznie testowy punkt ${index}`, coordinates: [19.94 + index * .003, 50.06] }));
  const context = { db, getUser, now: () => timestamp, store: { place: id => places.find(item => item.id === id), places: () => places } };
  registerObservationRoutes(app, context);
  if (game) {
    db.exec('CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,user_id TEXT,kind TEXT,lon REAL,lat REAL,description TEXT,width_cm REAL,status TEXT,created_at TEXT)');
    registerGameRoutes(app, context);
  }
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: { code: error.code, message: error.message } }));
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const f = { db, places, advance: (seconds = 100) => { timestamp += seconds * 1000; },
    input: (index = 0, type = 'rest_place') => ({ type, coordinates: places[index].coordinates, description: `Ławka numer ${index} z oparciem przy północnej ścieżce obok wejścia na plac.`, observedNow: true, expectedUserId: 'alice' }),
    async request(path, body, user = 'alice') {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { method: body === undefined ? 'GET' : 'POST',
        headers: { ...(user ? { 'x-test-user': user } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, body: await response.json() };
    },
    async close() { if (closed) return; closed = true; await new Promise(resolve => server.close(resolve)); db.close(); },
  };
  fixtures.push(f); return f;
}

test('positive observation is public without author identifiers, private list and withdrawal are owner only', async () => {
  const f = await fixture();
  assert.equal((await f.request('/observations', f.input(), null)).status, 401);
  assert.equal((await f.request('/observations', { ...f.input(), expectedUserId: 'bob' })).status, 409);
  const saved = await f.request('/observations', { ...f.input(), userId: 'bob', verified: true });
  assert.equal(saved.status, 201); assert.equal(saved.body.isMine, true); assert.equal(saved.body.verification, 'unverified'); assert.equal(saved.body.affectsRouting, false);
  assert.equal(saved.body.userId, undefined); assert.equal(saved.body.user_id, undefined);
  const publicList = await f.request('/observations', undefined, null);
  assert.equal(publicList.body.observations.length, 1); assert.equal(publicList.body.observations[0].isMine, false);
  assert.equal((await f.request('/observations/mine', undefined, 'bob')).body.observations.length, 0);
  assert.equal((await f.request('/observations/mine', undefined, null)).status, 401);
  assert.equal((await f.request(`/observations/${saved.body.id}/withdraw`, {}, 'bob')).status, 403);
  assert.equal((await f.request(`/observations/${saved.body.id}/withdraw`, { expectedUserId: 'bob' })).status, 409);
  const withdrawn = await f.request(`/observations/${saved.body.id}/withdraw`, {});
  assert.equal(withdrawn.body.status, 'withdrawn');
  assert.equal((await f.request(`/observations/${saved.body.id}/withdraw`, {})).body.withdrawnAt, withdrawn.body.withdrawnAt);
  assert.equal((await f.request('/observations', undefined, null)).body.observations.length, 0);
  assert.equal((await f.request('/observations/mine')).body.observations.length, 1);
  assert.equal(f.db.prepare("SELECT count(*) AS total FROM sqlite_master WHERE name='reports'").get().total, 0);
});

test('positive observations validate coordinates, details and confirmation and reject prototype names', async () => {
  const f = await fixture();
  for (const invalid of [{ type: 'kerb' }, { type: 'toString' }, { type: '__proto__' }, { coordinates: [0, 0] }, { coordinates: ['19.94', 50.06] },
    { observedNow: false }, { description: 'ławka' }, { description: 'ławka ławka ławka ławka ławka ławka ławka ławka' }, { description: 'a'.repeat(801) }])
    assert.equal((await f.request('/observations', { ...f.input(), ...invalid })).status, 400);
  assert.equal((await f.request('/observations')).body.observations.length, 0);
  for (const query of ['?limit=201', '?limit=2.5', '?type=toString', '?bbox=0,0,1', '?bbox=20,50,19,51', '?bbox=,,,'])
    assert.equal((await f.request('/observations' + query)).status, 400);
});

test('positive observations expire by type, public filters exclude stale but own history keeps it', async () => {
  const f = await fixture();
  await f.request('/observations', f.input(0, 'rest_place')); f.advance();
  await f.request('/observations', f.input(1, 'step_free_entrance')); f.advance();
  await f.request('/observations', f.input(2, 'lift_working'));
  assert.equal((await f.request('/observations?type=rest_place&bbox=19.939,50.059,19.941,50.061')).body.observations.length, 1);
  assert.equal((await f.request('/observations?limit=1')).body.observations.length, 1);
  f.advance(7201); assert.equal((await f.request('/observations')).body.observations.length, 2);
  f.advance(86400); assert.equal((await f.request('/observations')).body.observations.length, 1);
  f.advance(7 * 86400); assert.equal((await f.request('/observations')).body.observations.length, 0);
  assert.equal((await f.request('/observations/mine')).body.observations.length, 3);
});

test('duplicate, nearby and rate protections persist across reopen and withdrawal', async () => {
  const filename = join(tmpdir(), `iskry-observations-test-${randomUUID()}.sqlite`); files.push(filename);
  const f = await fixture({ filename }), input = f.input();
  const original = await f.request('/observations', input);
  await f.request(`/observations/${original.body.id}/withdraw`, {});
  await f.close();
  const reopened = await fixture({ filename });
  assert.equal((await reopened.request('/observations', input)).body.error.code, 'DUPLICATE_OBSERVATION');
  assert.equal((await reopened.request('/observations', { ...input, description: 'Inna treść opisująca to samo miejsce odpoczynku obok wejścia do ogrodu.' })).body.error.code, 'DUPLICATE_OBSERVATION');
  assert.equal((await reopened.request('/observations', reopened.input(1))).body.error.code, 'OBSERVATION_TOO_FAST');
  for (let index = 1; index < 10; index++) { reopened.advance(31); assert.equal((await reopened.request('/observations', reopened.input(index))).status, 201); }
  reopened.advance(31); assert.equal((await reopened.request('/observations', reopened.input(10))).body.error.code, 'OBSERVATION_DAILY_LIMIT');
  assert.equal((await reopened.request('/observations/mine')).body.observations.length, 10);
});

test('positive game reward uses separate ID, cannot become report, and withdrawal cannot farm another reward', async () => {
  const f = await fixture({ game: true });
  const saved = (await f.request('/observations', f.input())).body;
  const claim = { observationId: saved.id, missionId: 'rest_place:positive:0', expectedUserId: 'alice' };
  assert.equal((await f.request('/game/claim', { ...claim, expectedUserId: 'bob' }, 'bob')).status, 403);
  assert.equal((await f.request('/game/claim', { ...claim, reportId: 'fake' })).status, 400);
  assert.equal((await f.request('/game/claim', { reportId: saved.id, missionId: claim.missionId })).body.error.code, 'MISSION_SOURCE_MISMATCH');
  assert.equal((await f.request('/game/claim', { ...claim, missionId: 'width:positive:0' })).body.error.code, 'MISSION_SOURCE_MISMATCH');
  assert.equal((await f.request('/game/claim', { ...claim, missionId: 'rest_place:positive:11' })).body.error.code, 'MISSION_LOCATION_MISMATCH');
  const rewarded = await f.request('/game/claim', claim); assert.equal(rewarded.body.awarded, 15);
  assert.equal((await f.request('/game/claim', claim)).body.awarded, 0);
  assert.equal(f.db.prepare('SELECT count(*) AS total FROM reports').get().total, 0);
  assert.equal(f.db.prepare('SELECT count(*) AS total FROM game_claims').get().total, 0);
  assert.equal(f.db.prepare('SELECT count(*) AS total FROM game_observation_claims').get().total, 1);
  await f.request(`/observations/${saved.id}/withdraw`, {});
  assert.equal((await f.request('/game/claim', claim)).body.awarded, 0);
  assert.equal((await f.request('/game/state')).body.earned, 15);
  f.advance(86401);
  const repeat = (await f.request('/observations', { ...f.input(), description: 'Ponownie opisana ławka z oparciem przy ścieżce od strony północnego wejścia.' })).body;
  assert.equal((await f.request('/game/claim', { ...claim, observationId: repeat.id })).body.error.code, 'DUPLICATE_OBSERVATION');
});

test('positive rewards and reports share daily limit, cooldown, description dedupe and one variety bonus', async () => {
  const f = await fixture({ game: true });
  const first = (await f.request('/observations', f.input())).body;
  await f.request('/game/claim', { observationId: first.id, missionId: 'rest_place:positive:0' });
  f.db.prepare('INSERT INTO reports VALUES(?,?,?,?,?,?,?,?,?)').run('test-report', 'alice', 'width', ...f.places[0].coordinates,
    'Zmierzone przewężenie między słupkiem a narożnikiem od strony wschodniego wejścia.', 85, 'active', '2026-10-03T12:00:00Z');
  assert.equal((await f.request('/game/claim', { reportId: 'test-report', missionId: 'width:positive:0' })).body.error.code, 'GAME_TOO_FAST');
  f.advance(); assert.equal((await f.request('/game/claim', { reportId: 'test-report', missionId: 'width:positive:0' })).body.awarded, 20);
  for (let index = 1; index <= 4; index++) {
    f.advance(); const saved = (await f.request('/observations', f.input(index, 'step_free_entrance'))).body;
    const result = await f.request('/game/claim', { observationId: saved.id, missionId: `step_free_entrance:positive:${index}` });
    assert.equal(result.status, index < 4 ? 201 : 429);
    if (index === 1) assert.equal(result.body.varietyBonus, 10);
    else if (index < 4) assert.equal(result.body.varietyBonus, 0);
    else assert.equal(result.body.error.code, 'GAME_DAILY_LIMIT');
  }
  assert.equal((await f.request('/game/state')).body.observations, 5);
  assert.equal((await f.request('/game/state')).body.earned, 90);
});

test('withdrawn and expired positive observations cannot receive new rewards', async () => {
  const f = await fixture({ game: true });
  const first = (await f.request('/observations', f.input(0, 'lift_working'))).body;
  await f.request(`/observations/${first.id}/withdraw`, {});
  assert.equal((await f.request('/game/claim', { observationId: first.id, missionId: 'lift_working:positive:0' })).body.error.code, 'OBSERVATION_NOT_ACTIVE');
  f.advance(); const second = (await f.request('/observations', f.input(1, 'lift_working'))).body;
  f.advance(7201);
  assert.equal((await f.request('/game/claim', { observationId: second.id, missionId: 'lift_working:positive:1' })).body.error.code, 'OBSERVATION_NOT_FRESH');
  assert.equal((await f.request('/game/state')).body.earned, 0);
});
