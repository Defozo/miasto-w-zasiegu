import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAuth } from '../helpers/local-auth.mjs';
import { registerFavorites } from '../../server/favorites.mjs';

const POINT = { id: 'test-address-1', label: 'Testowy adres, Kraków', coordinates: [19.938, 50.061], kind: 'address', precision: 'address',
  sourceLabel: 'Wyłącznie dane testowe', sourceUrl: 'https://example.test/address', coordinateKind: 'representative-center' };
const opened = [];
after(async () => { for (const service of opened) await service.close(); });

async function fixture(path = ':memory:') {
  const db = new DatabaseSync(path); db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000');
  const app = express(), auth = createAuth(db), context = { db, auth, getUser: req => auth.getUser(req) };
  app.locals.context = context;
  app.use(express.json({ limit: '16kb' }));
  auth.registerRoutes(app); registerFavorites(app, context);
  app.use((error, _req, res, _next) => res.status(error.status ?? 500).json({ error: { code: error.code, message: error.message } }));
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  let closed = false;
  const service = { db,
    async request(path, { method = 'GET', body, token, cookie } = {}) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { method,
        headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cookie ? { Cookie: cookie } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, body: await response.json(), headers: response.headers };
    },
    async register(name) {
      const result = await this.request('/auth/register', { method: 'POST', body: { email: `${name}@example.test`, password: 'local-favorite-test-only', displayName: name } });
      assert.equal(result.status, 201);
      return { ...result.body, cookie: result.headers.get('set-cookie').split(';')[0] };
    },
    async close() { if (closed) return; closed = true; await new Promise(resolve => server.close(resolve)); db.close(); },
  };
  opened.push(service); return service;
}

test('favorites require account and isolate addresses, creation ownership and deletion across cookie/Bearer users', async () => {
  const f = await fixture(), alice = await f.register('alice'), bob = await f.register('bob');
  for (const [method, path, body] of [['GET', '/favorites'], ['POST', '/favorites', { label: 'Dom', point: POINT }], ['DELETE', '/favorites/absent']])
    assert.equal((await f.request(path, { method, body })).status, 401);
  const added = await f.request('/favorites', { method: 'POST', cookie: alice.cookie, body: { label: 'Dom', point: POINT, userId: bob.user.id, expectedUserId: alice.user.id } });
  assert.equal(added.status, 201); assert.equal(added.body.userId, undefined); assert.deepEqual(added.body.point, POINT);
  assert.equal(added.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await f.request('/favorites', { token: bob.token })).body, { favorites: [] });
  assert.deepEqual((await f.request('/favorites', { token: alice.token })).body.favorites, [added.body]);
  const denied = await f.request(`/favorites/${added.body.id}`, { method: 'DELETE', token: bob.token });
  const absent = await f.request('/favorites/does-not-exist', { method: 'DELETE', token: bob.token });
  assert.equal(denied.status, 404); assert.deepEqual(denied.body, absent.body);
  assert.equal((await f.request('/favorites', { token: alice.token })).body.favorites.length, 1);
  const removed = await f.request(`/favorites/${added.body.id}`, { method: 'DELETE', cookie: alice.cookie, body: { expectedUserId: alice.user.id } });
  assert.deepEqual(removed.body, { ok: true }); assert.equal(removed.status, 200);
  assert.deepEqual((await f.request('/favorites', { token: alice.token })).body.favorites, []);
});

test('same label and point deduplicate without overwriting; aliases and moved coordinates survive; max thirty per user', async () => {
  const f = await fixture(), alice = await f.register('alice'), bob = await f.register('bob');
  const save = body => f.request('/favorites', { method: 'POST', token: alice.token, body });
  const first = await save({ label: 'Mój dom', point: POINT });
  const duplicate = await save({ label: '  MÓJ   DOM ', point: { ...POINT, sourceLabel: 'Changed source must not overwrite previous record', coordinates: [19.93800001, 50.061] } });
  assert.equal(duplicate.status, 200); assert.deepEqual(duplicate.body, first.body);
  const alias = await save({ label: 'Praca', point: POINT }); assert.equal(alias.status, 201); assert.notEqual(alias.body.id, first.body.id);
  const moved = await save({ label: 'Mój dom', point: { ...POINT, coordinates: [19.939, 50.061] } }); assert.equal(moved.status, 201);
  for (let i = 3; i < 30; i++) assert.equal((await save({ label: `Miejsce ${i}`, point: POINT })).status, 201);
  const full = await save({ label: 'Nowe miejsce', point: POINT }); assert.equal(full.status, 409); assert.equal(full.body.error.code, 'FAVORITE_LIMIT');
  assert.equal((await save({ label: 'Mój dom', point: POINT })).status, 200);
  assert.equal((await f.request('/favorites', { token: alice.token })).body.favorites.length, 30);
  assert.equal((await f.request('/favorites', { method: 'POST', token: bob.token, body: { label: 'Mój dom', point: POINT } })).status, 201);
  await f.request(`/favorites/${alias.body.id}`, { method: 'DELETE', token: alice.token });
  assert.equal((await save({ label: 'Nowe miejsce', point: POINT })).status, 201);
});

test('favorites validate area and fields, ignore unexpected private fields, and reject stale account writes', async () => {
  const f = await fixture(), alice = await f.register('alice'), bob = await f.register('bob');
  const invalid = [null, {}, { label: '', point: POINT }, { label: 'x'.repeat(81), point: POINT },
    ...[{ coordinates: [0, 0] }, { coordinates: ['19.938', 50.061] }, { coordinates: [19.938, null] }, { id: '' }, { id: 'x'.repeat(161) },
      { label: 'line\nbreak' }, { kind: 'building' }, { precision: 'verified' }, { sourceUrl: 'javascript:alert(1)' },
      { sourceUrl: 'https://user:password@example.test/path' }].map(extra => ({ label: 'Dom', point: { ...POINT, ...extra } }))];
  for (const body of invalid) assert.equal((await f.request('/favorites', { method: 'POST', token: alice.token, body })).status, 400);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM favorites').get().n, 0);
  const stale = await f.request('/favorites', { method: 'POST', cookie: bob.cookie, body: { label: 'Dom', point: POINT, expectedUserId: alice.user.id } });
  assert.equal(stale.status, 409); assert.equal(stale.body.error.code, 'ACCOUNT_CHANGED');
  const added = await f.request('/favorites', { method: 'POST', token: alice.token, body: { label: 'Dom', point: { ...POINT, secret: 'not persisted', fieldVerified: true } } });
  assert.equal(added.body.point.secret, undefined); assert.equal(added.body.point.fieldVerified, undefined);
  const staleDelete = await f.request(`/favorites/${added.body.id}`, { method: 'DELETE', cookie: alice.cookie, body: { expectedUserId: bob.user.id } });
  assert.equal(staleDelete.status, 409); assert.equal((await f.request('/favorites', { token: alice.token })).body.favorites.length, 1);
});

test('favorites and ownership persist after database reopen without importing account data into another account', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cracow-favorites-')), path = join(dir, 'favorites.sqlite');
  let a, b;
  try {
    a = await fixture(path);
    const alice = await a.register('alice'), bob = await a.register('bob');
    const saved = await a.request('/favorites', { method: 'POST', token: alice.token, body: { label: 'Dom', point: POINT } });
    await a.close(); b = await fixture(path);
    assert.deepEqual((await b.request('/favorites', { cookie: alice.cookie })).body.favorites, [saved.body]);
    assert.deepEqual((await b.request('/favorites', { token: bob.token })).body.favorites, []);
    assert.equal((await b.request(`/favorites/${saved.body.id}`, { method: 'DELETE', token: bob.token })).status, 404);
    const duplicate = await b.request('/favorites', { method: 'POST', token: alice.token, body: { label: 'Dom', point: POINT } });
    assert.equal(duplicate.status, 200); assert.deepEqual(duplicate.body, saved.body);
  } finally { await a?.close(); await b?.close(); rmSync(dir, { recursive: true, force: true }); }
});
