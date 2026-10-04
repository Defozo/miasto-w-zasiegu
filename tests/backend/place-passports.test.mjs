import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { registerPlacePassportRoutes } from '../../server/place-passports.mjs';
import { emptyPassportContent, emptyPassportFields } from '../../shared/place-passports.mjs';

const opened = [];
after(async () => { for (const fixture of opened) await fixture.close(); });
const initialSource = () => ({ id: 'osm-node-test', name: 'Muzeum testowe', category: 'culture',
  address: 'Ulica Testowa 1, Kraków', coordinates: [19.94, 50.06], description: 'Fixture only',
  sourceLabel: 'OpenStreetMap', sourceUrl: 'https://www.openstreetmap.org/node/123',
  access: { wheelchair: 'unknown', widthCm: 90, surface: null, toilet: 'unknown', entranceNotes: '' },
  provenance: { datasetId: 'osm-test', recordUpdatedAt: '2026-01-01T00:00:00Z', importedAt: '2026-10-01T00:00:00Z', verification: 'source-only' } });

async function fixture({ filename = ':memory:', source = initialSource(), verify } = {}) {
  const db = new DatabaseSync(filename), sources = new Map(source ? [[source.id, source]] : []);
  let timestamp = Date.parse('2026-10-03T12:00:00Z'), closed = false;
  const store = { place: id => sources.get(id) ?? null, places: () => [...sources.values()] };
  const app = express(); app.use(express.json({ limit: '128kb' }));
  const users = { alice: { id: 'alice', displayName: 'Alicja', email: 'private-alice@example.test' },
    bob: { id: 'bob', displayName: 'Robert', email: 'private-bob@example.test' } };
  const service = registerPlacePassportRoutes(app, { db, store, getUser: req => users[req.get('x-test-user')] ?? null },
    { now: () => timestamp, siteVerification: verify ? { getBadge: verify } : undefined });
  app.use((error, _req, res, _next) => res.status(error.status ?? 500).json({ error: {
    code: error.code, message: error.message, details: error.details,
  } }));
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const f = { db, service, sources, store, users,
    advance: milliseconds => { timestamp += milliseconds; },
    async call(path, { method = 'GET', body, user = 'alice' } = {}) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/place-passports${path}`, {
        method, headers: { ...(user ? { 'x-test-user': user } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json(), headers: response.headers };
    },
    async draft(placeId, user = 'alice') {
      const result = await f.call('/drafts', { method: 'POST', body: { ...(placeId ? { placeId } : {}), expectedUserId: user }, user });
      assert.equal(result.status, 201, JSON.stringify(result.body)); return result.body;
    },
    async save(draft, change = () => {}, user = 'alice') {
      const content = structuredClone(draft.content); change(content);
      const result = await f.call(`/drafts/${draft.id}`, { method: 'PUT', user,
        body: { content, expectedDraftVersion: draft.draftVersion, expectedUserId: user } });
      assert.equal(result.status, 200, JSON.stringify(result.body)); return result.body;
    },
    async publish(draft, user = 'alice') {
      const result = await f.call(`/drafts/${draft.id}/publish`, { method: 'POST', user,
        body: { expectedDraftVersion: draft.draftVersion, expectedPublishedRevision: draft.baseRevision, expectedUserId: user } });
      assert.equal(result.status, 200, JSON.stringify(result.body)); return result.body;
    },
    async close() { if (closed) return; closed = true; await new Promise(resolve => server.close(resolve)); db.close(); },
  };
  opened.push(f); return f;
}

function newPlace(content) {
  Object.assign(content.place, { name: 'Wyłącznie testowy hotel', category: 'accommodation', address: 'Testowa 12',
    coordinates: [19.935, 50.065], website: 'https://hotel.example.test/' });
  content.fields.toilet.value = 'yes';
  content.entrances = [{ id: 'courtyard', label: 'Od dziedzińca', coordinates: [19.9351, 50.0651], fields: emptyPassportFields() }];
  content.entrances[0].fields.widthCm = { value: 84, sourceLabel: 'Pomiar przy drzwiach', observedAt: '2026-10-02', sourceUrl: null };
  content.entrances[0].fields.steps.value = 'no';
}

test('new place remains private until publication, public output has no account secrets and projects into the catalogue', async () => {
  const f = await fixture({ verify: (id, website) => id === 'alice' && website === 'https://hotel.example.test/'
    ? { host: 'hotel.example.test', verifiedAt: '2026-10-02T00:00:00Z', expiresAt: '2026-11-01T00:00:00Z' } : null });
  assert.equal((await f.call('/drafts', { method: 'POST', body: {}, user: null })).status, 401);
  assert.equal((await f.call('/mine', { user: null })).status, 401);
  let draft = await f.draft();
  assert.match(draft.placeId, /^community-place-/);
  assert.equal(draft.content.place.coordinates, null);
  assert.equal((await f.call(`/drafts/${draft.id}`, { user: 'bob' })).status, 404);
  assert.equal((await f.call(`/drafts/${draft.id}?expectedUserId=bob`)).status, 409);
  assert.equal((await f.call('/mine?expectedUserId=bob')).status, 409);
  assert.equal((await f.call(`/${draft.placeId}`, { user: null })).status, 404);
  assert.equal(f.service.publishedPlaces().length, 0);
  draft = await f.save(draft, newPlace);
  assert.equal((await f.call('/mine')).body.drafts[0].id, draft.id);
  const result = await f.publish(draft);
  assert.equal(result.passport.revision, 1);
  assert.equal(result.draft.baseRevision, 1);
  assert.equal(result.draft.draftVersion, draft.draftVersion + 1);
  const publicResult = await f.call(`/${draft.placeId}`, { user: null });
  assert.deepEqual(publicResult.body, result.passport);
  assert.equal(publicResult.headers.get('cache-control'), 'no-store');
  const width = publicResult.body.entrances[0].fields.widthCm;
  assert.equal(width.value, 84);
  assert.equal(width.status, 'unverified');
  assert.equal(width.evidence[0].author.displayName, 'Alicja');
  assert.equal(width.evidence[0].siteVerification.host, 'hotel.example.test');
  assert.equal(width.evidence[0].observedAt, '2026-10-02');
  assert.equal(publicResult.body.fields.lift.status, 'unknown');
  const publicJson = JSON.stringify(publicResult.body);
  for (const secret of ['private-alice', 'private-bob', '"user_id"', '"userId"', '"email"', '"password"']) assert(!publicJson.includes(secret));
  const projection = f.service.getPlace(draft.placeId);
  assert.equal(projection.category, 'accommodation');
  assert.equal(projection.provenance, undefined);
  assert.equal(projection.verifiedAt, null);
  assert.equal(projection.access.widthCm, null, 'entrance measurements do not silently become building measurements');
  assert.equal(f.service.projectPlaces(f.store.places()).length, 2);
  assert.equal(f.store.place(draft.placeId), null, 'community publication never inserts a source row');
  assert.equal((await f.call('/mine')).body.places[0].placeId, draft.placeId);
});

test('source dates stay distinct, changed values keep conflicting evidence, and authors never inherit a domain badge', async () => {
  const f = await fixture({ verify: (id, website) => id === 'alice' && website === 'https://hotel.example.test/'
    ? { host: 'hotel.example.test', verifiedAt: '2026-10-02T00:00:00Z', expiresAt: '2026-11-01T00:00:00Z' } : null });
  const source = (await f.call('/osm-node-test')).body.fields.widthCm;
  assert.equal(source.status, 'source-only'); assert.equal(source.evidence[0].observedAt, null);
  assert.equal(source.evidence[0].recordUpdatedAt, '2026-01-01T00:00:00Z');
  let draft = await f.draft('osm-node-test');
  draft = await f.save(draft, content => {
    content.place.website = 'https://hotel.example.test/';
    content.fields.widthCm = { value: 84, observedAt: '2026-10-02' };
    content.fields.ramp.value = 'yes';
  });
  let saved = await f.publish(draft);
  assert.equal(saved.passport.fields.widthCm.status, 'conflict');
  assert.equal(saved.passport.fields.widthCm.value, null);
  assert.deepEqual(saved.passport.fields.widthCm.evidence.map(item => item.value), [90, 84]);
  assert.equal(f.service.getPlace('osm-node-test').access.widthCm, null);
  const originalRamp = saved.passport.fields.ramp.evidence[0];
  let bob = await f.draft('osm-node-test', 'bob');
  bob = await f.save(bob, content => { content.fields.widthCm = { value: 82, observedAt: '2026-10-03' }; }, 'bob');
  saved = await f.publish(bob, 'bob');
  assert.deepEqual(saved.passport.fields.ramp.evidence, [originalRamp]);
  const widths = saved.passport.fields.widthCm.evidence;
  assert.deepEqual(widths.map(item => item.value), [90, 84, 82]);
  assert.equal(widths[1].siteVerification.host, 'hotel.example.test');
  assert.equal(widths[2].siteVerification, null);
  assert.equal(widths[2].author.displayName, 'Robert');
  const corrected = await f.save(saved.draft, content => { content.fields.widthCm.value = 81; }, 'bob');
  saved = await f.publish(corrected, 'bob');
  assert.deepEqual(saved.passport.fields.widthCm.evidence.map(item => item.value), [90, 84, 81]);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM place_passport_evidence WHERE retired_revision IS NOT NULL').get().n, 1);
  assert.equal((await f.call('/osm-node-test/history', { user: null })).body.revisions.length, 3);
  const historic = await f.call('/osm-node-test/history/1', { user: null });
  assert.equal(historic.body.content.fields.widthCm.value, 84);
  assert.equal(historic.body.author.displayName, 'Alicja');
  assert.equal((await f.call('/osm-node-test/history/2.5')).status, 400);
});

test('draft and publication CAS preserve work; explicit rebase preserves another author changes before a separate publication', async () => {
  const f = await fixture();
  let alice = await f.draft('osm-node-test'), bob = await f.draft('osm-node-test', 'bob');
  const staleAlice = structuredClone(alice);
  alice = await f.save(alice, content => {
    content.fields.ramp.value = 'yes';
    content.entrances.push({ id: 'north', label: 'Północne', coordinates: null, fields: emptyPassportFields() });
  });
  const concurrentSave = await f.call(`/drafts/${alice.id}`, { method: 'PUT',
    body: { content: staleAlice.content, expectedDraftVersion: staleAlice.draftVersion } });
  assert.equal(concurrentSave.status, 409); assert.equal(concurrentSave.body.error.code, 'DRAFT_CONFLICT');
  bob = await f.save(bob, content => { content.fields.toilet.value = 'yes'; }, 'bob');
  await f.publish(alice);
  const oldPublish = await f.call(`/drafts/${bob.id}/publish`, { method: 'POST', user: 'bob',
    body: { expectedDraftVersion: bob.draftVersion, expectedPublishedRevision: 0 } });
  assert.equal(oldPublish.status, 409); assert.equal(oldPublish.body.error.code, 'PASSPORT_CONFLICT');
  assert.equal((await f.call(`/drafts/${bob.id}`, { user: 'bob' })).body.content.fields.toilet.value, 'yes');
  const bypass = await f.call(`/drafts/${bob.id}/publish`, { method: 'POST', user: 'bob',
    body: { expectedDraftVersion: bob.draftVersion, expectedPublishedRevision: 1 } });
  assert.equal(bypass.status, 409, 'a newer numeric revision alone cannot bypass review/rebase');
  const rebase = await f.call(`/drafts/${bob.id}/rebase`, { method: 'POST', user: 'bob',
    body: { expectedDraftVersion: bob.draftVersion, expectedPublishedRevision: 1, expectedUserId: 'bob' } });
  assert.equal(rebase.status, 200, JSON.stringify(rebase.body));
  assert.equal(rebase.body.content.fields.ramp.value, 'yes');
  assert.equal(rebase.body.content.fields.toilet.value, 'yes');
  assert.equal(rebase.body.content.entrances[0].id, 'north');
  assert.equal(f.service.getPassport('osm-node-test').revision, 1, 'rebase does not publish');
  const saved = await f.publish(rebase.body, 'bob');
  assert.equal(saved.passport.revision, 2);
  assert.equal(saved.passport.fields.ramp.evidence[0].author.displayName, 'Alicja');
  assert.equal(saved.passport.fields.toilet.evidence[0].author.displayName, 'Robert');
  assert.deepEqual((await f.call('/osm-node-test/history')).body.revisions[0].changedFields, ['fields.toilet']);
});

test('publication and drafts survive restart, source refresh cannot overwrite claims, and an expired source retains its labelled snapshot', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'passport-test-')), filename = join(directory, 'passport.sqlite');
  let first, second;
  try {
    first = await fixture({ filename });
    let draft = await first.draft('osm-node-test');
    draft = await first.save(draft, content => { content.fields.widthCm.value = 84; });
    const result = await first.publish(draft);
    await first.close();
    second = await fixture({ filename, source: { ...initialSource(), name: 'Nowa nazwa w źródle', access: { ...initialSource().access, widthCm: 80 } } });
    assert.equal((await second.call(`/drafts/${draft.id}`)).body.baseRevision, 1);
    const current = second.service.getPassport('osm-node-test');
    assert.equal(current.place.name, 'Nowa nazwa w źródle', 'unedited source metadata still refreshes');
    assert.deepEqual(current.fields.widthCm.evidence.map(item => item.value), [80, 84]);
    assert.equal(second.store.place('osm-node-test').access.widthCm, 80);
    assert.equal(result.passport.fields.widthCm.evidence[1].id, current.fields.widthCm.evidence[1].id);
    second.advance(31 * 86400000);
    assert.equal(second.service.getPassport('osm-node-test').fields.widthCm.evidence[1].value, 84, 'permanent measurements do not disappear after 24 hours');
    second.sources.delete('osm-node-test');
    const missing = second.service.getPassport('osm-node-test');
    assert.equal(missing.sourcePlace.provenance.stale, true);
    assert.equal(missing.sourcePlace.provenance.syncStatus, 'missing');
    assert.equal(missing.fields.widthCm.evidence[1].value, 84);
  } finally {
    await first?.close(); await second?.close(); rmSync(directory, { recursive: true, force: true });
  }
});

test('validation rejects malformed facts, coordinates, unsafe links, duplicated entrance identities and forged ownership', async () => {
  const f = await fixture(); let draft = await f.draft();
  assert.equal((await f.call(`/drafts/${draft.id}/publish`, { method: 'POST', body: { expectedDraftVersion: draft.draftVersion, expectedPublishedRevision: 0 } })).status, 400);
  draft = await f.save(draft, newPlace);
  const invalidChanges = [
    content => { content.place.coordinates = [0, 0]; },
    content => { content.place.category = 'anywhere'; },
    content => { content.place.website = 'javascript:alert(1)'; },
    content => { content.fields.widthCm.value = 0; },
    content => { content.fields.widthCm.value = '84'; },
    content => { content.fields.steps.value = 'unknown'; },
    content => { content.fields.widthCm.observedAt = '2026-02-30'; },
    content => { content.fields.widthCm.observedAt = '2026-10-04'; },
    content => { content.fields.widthCm.sourceUrl = 'https://login:password@example.test/'; },
    content => { content.entrances.push(structuredClone(content.entrances[0])); },
    content => { content.entrances[0].id = '__proto__'; },
    content => { content.fields.notAField = { value: 'yes' }; },
  ];
  for (const change of invalidChanges) {
    const content = structuredClone(draft.content); change(content);
    const result = await f.call(`/drafts/${draft.id}`, { method: 'PUT', body: { content, expectedDraftVersion: draft.draftVersion } });
    assert.equal(result.status, 400, JSON.stringify(result.body));
  }
  assert.equal((await f.call(`/drafts/${draft.id}`, { method: 'PUT', body: { content: draft.content, expectedDraftVersion: draft.draftVersion, expectedUserId: 'bob' } })).status, 409);
  assert.equal((await f.call(`/drafts/${draft.id}/publish`, { method: 'POST', user: 'bob', body: { expectedDraftVersion: draft.draftVersion, expectedPublishedRevision: 0 } })).status, 404);
  const forged = structuredClone(draft.content); forged.fields.toilet.userId = 'bob'; forged.fields.toilet.verified = true;
  draft = await f.save(draft, content => Object.assign(content, forged));
  const saved = await f.publish(draft);
  assert.equal(saved.passport.fields.toilet.evidence[0].author.displayName, 'Alicja');
  assert.equal(saved.passport.fields.toilet.status, 'unverified');
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM place_passport_revisions').get().n, 1);
});

test('unknown does not delete another source, and changing a website does not move historical field badges', async () => {
  const calls = [];
  const f = await fixture({ verify: (id, website) => { calls.push([id, website]); return null; } });
  let draft = await f.draft(); draft = await f.save(draft, newPlace);
  let saved = await f.publish(draft);
  let bob = await f.draft(saved.passport.placeId, 'bob');
  bob = await f.save(bob, content => { content.entrances[0].fields.widthCm.value = 88; }, 'bob');
  saved = await f.publish(bob, 'bob');
  assert.equal(saved.passport.entrances[0].fields.widthCm.status, 'conflict');
  bob = await f.save(saved.draft, content => {
    content.place.website = 'https://new.example.test/';
    content.entrances[0].fields.widthCm.value = null;
  }, 'bob');
  saved = await f.publish(bob, 'bob');
  const width = saved.passport.entrances[0].fields.widthCm;
  assert.equal(width.value, 84);
  assert(width.evidence.some(item => item.value === null));
  calls.length = 0; f.service.getPassport(saved.passport.placeId);
  assert(calls.some(([id, website]) => id === 'alice' && website === 'https://hotel.example.test/'));
  assert(!calls.some(([id, website]) => id === 'alice' && website === 'https://new.example.test/'));
});

test('wrapping the catalogue with projections never feeds projections back into raw source evidence', async () => {
  const f = await fixture(); let draft = await f.draft('osm-node-test');
  draft = await f.save(draft, content => { content.fields.widthCm.value = 84; }); await f.publish(draft);
  const basePlaces = f.store.places.bind(f.store), basePlace = f.store.place.bind(f.store);
  f.store.places = () => f.service.projectPlaces(basePlaces());
  f.store.place = id => f.service.getPlace(id) ?? basePlace(id);
  assert.equal(f.store.places().length, 1);
  assert.equal(f.store.place('osm-node-test').access.widthCm, null);
  assert.deepEqual(f.service.getPassport('osm-node-test').fields.widthCm.evidence.map(item => item.value), [90, 84]);
});
