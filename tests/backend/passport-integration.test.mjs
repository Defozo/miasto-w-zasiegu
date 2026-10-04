import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { app as defaultApp, createApp } from '../../server/index.mjs';
import { createAuth as localTestAuth } from '../helpers/local-auth.mjs';
import { emptyPassportFields, PASSPORT_FIELD_DEFINITIONS } from '../../shared/place-passports.mjs';

after(() => defaultApp.locals.store.close());

const sourcePlace = () => ({ id: 'osm-node-987654321', name: 'Wyłącznie testowe muzeum', category: 'culture',
  coordinates: [19.94, 50.06], address: 'Testowa 14, Kraków', description: 'Dane wyłącznie testowe.',
  access: { wheelchair: 'unknown', widthCm: 90, surface: null, toilet: 'unknown', entranceNotes: '' },
  sourceUrl: 'https://www.openstreetmap.org/node/987654321', sourceLabel: 'OpenStreetMap',
  osmUpdatedAt: '2026-09-01T00:00:00.000Z', verifiedAt: null, coordinateKind: 'osm-node' });

async function fixture(t) {
  const prefix = resolve(tmpdir(), 'passport-integration-');
  const directory = mkdtempSync(prefix), placesPath = join(directory, 'places.json');
  const locationsPath = join(directory, 'locations.json'), dbPath = join(directory, 'test.sqlite');
  const services = [];
  function writePlaces(places = [sourcePlace()]) {
    writeFileSync(placesPath, JSON.stringify({ importedAt: '2026-10-01T00:00:00.000Z',
      source: { url: 'https://download.geofabrik.de/europe/poland/malopolskie.html', snapshotDate: '2026-10-01', attribution: '© OpenStreetMap contributors' }, places }));
  }
  writePlaces();
  writeFileSync(locationsPath, JSON.stringify({ source: { label: 'Isolated test addresses' }, locations: [
    { id: 'address-osm-node-987654321', label: 'Testowa 14, Kraków', kind: 'address', precision: 'address',
      coordinates: [19.94, 50.06], sourceUrl: sourcePlace().sourceUrl, sourceLabel: 'Wyłącznie testowy adres' },
  ] }));
  async function start() {
    const app = createApp({ dbPath, placesPath, locationsPath, municipalPath: null, authFactory: localTestAuth,
      fetchImpl: async () => { throw new Error('Integration fixtures must not access an external routing service'); } });
    const server = await new Promise(resolveServer => {
      const listener = app.listen(0, '127.0.0.1', () => resolveServer(listener));
    });
    let closed = false;
    const service = { app,
      async call(path, { method = 'GET', body, token, headers = {} } = {}) {
        const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
          method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
            ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        return { status: response.status, body: await response.json(), headers: response.headers };
      },
      async register() {
        const result = await service.call('/api/auth/register', { method: 'POST', body: {
          email: 'passport-test@example.test', password: 'integration-fixture-password', displayName: 'Autor testowy',
        } });
        assert.equal(result.status, 201, JSON.stringify(result.body)); return result.body;
      },
      async draft(account, placeId) {
        const result = await service.call('/api/place-passports/drafts', { method: 'POST', token: account.token,
          body: { expectedUserId: account.user.id, ...(placeId ? { placeId } : {}) } });
        assert.equal(result.status, 201, JSON.stringify(result.body)); return result.body;
      },
      async save(account, draft, change) {
        const content = structuredClone(draft.content); change(content);
        const result = await service.call(`/api/place-passports/drafts/${draft.id}`, { method: 'PUT', token: account.token,
          body: { expectedUserId: account.user.id, expectedDraftVersion: draft.draftVersion, content } });
        assert.equal(result.status, 200, JSON.stringify(result.body)); return result.body;
      },
      async publish(account, draft) {
        const result = await service.call(`/api/place-passports/drafts/${draft.id}/publish`, { method: 'POST', token: account.token,
          body: { expectedUserId: account.user.id, expectedDraftVersion: draft.draftVersion, expectedPublishedRevision: draft.baseRevision } });
        assert.equal(result.status, 200, JSON.stringify(result.body)); return result.body;
      },
      async close() { if (closed) return; closed = true; await new Promise(done => server.close(done)); app.locals.store.close(); },
    };
    services.push(service); return service;
  }
  t.after(async () => {
    for (const service of services) await service.close();
    if (!resolve(directory).startsWith(prefix)) throw new Error('Unexpected integration fixture cleanup path');
    rmSync(directory, { recursive: true, force: true });
  });
  return { start, writePlaces };
}

test('publishing hotel and service places makes them immediately public in the catalogue and location search', async t => {
  const f = await fixture(t), service = await f.start(), account = await service.register();
  for (const [category, name] of [['accommodation', 'Hotel Integracyjny'], ['services', 'Pracownia Integracyjna']]) {
    let draft = await service.draft(account);
    draft = await service.save(account, draft, content => {
      Object.assign(content.place, { name, category, address: 'Nowa Testowa 7, Kraków', coordinates: [19.942, 50.062],
        website: category === 'services' ? sourcePlace().sourceUrl : 'https://example.test/' });
      content.fields.toilet.value = 'yes';
      content.entrances.push({ id: 'main', label: 'Wejście główne', coordinates: [19.9421, 50.0621], fields: emptyPassportFields() });
      content.entrances[0].fields.widthCm.value = 88;
    });
    const before = await service.call(`/api/places?q=${encodeURIComponent(name)}&category=${category}`);
    assert.equal(before.body.total, 0);
    assert.equal((await service.call(`/api/places/${draft.placeId}`)).status, 404);
    const saved = await service.publish(account, draft);
    const list = await service.call(`/api/places?q=${encodeURIComponent(name)}&category=${category}`);
    assert.equal(list.status, 200); assert.equal(list.body.total, 1);
    assert.equal(list.body.places[0].id, draft.placeId);
    const detail = await service.call(`/api/places/${draft.placeId}`);
    assert.equal(detail.status, 200); assert.equal(detail.body.name, name);
    assert.equal(detail.body.category, category); assert.equal(detail.body.passportRevision, 1);
    assert.equal(detail.body.access.widthCm, null, 'a single entrance width must not turn into a building-wide promise');
    const search = await service.call(`/api/locations?q=${encodeURIComponent(name)}`);
    assert.equal(search.status, 200);
    assert.equal(search.body.locations.filter(place => place.id === draft.placeId).length, 1);
    assert.deepEqual(search.body.locations.find(place => place.id === draft.placeId).coordinates, saved.passport.place.coordinates);
    const byAddress = await service.call('/api/locations?q=Nowa%20Testowa%207');
    assert(byAddress.body.locations.some(place => place.id === draft.placeId), 'new places are searchable by their declared address');
    assert.equal((await service.call('/api/locations?q=Nowa%20Testowa%2070')).body.total, 0, 'house number matching stays exact');
    const publicPassport = await service.call(`/api/place-passports/${draft.placeId}`);
    assert.deepEqual(publicPassport.body, saved.passport);
    assert.equal(publicPassport.body.entrances[0].fields.widthCm.value, 88);
    assert(!JSON.stringify(publicPassport.body).includes(account.user.email));
  }
  assert.equal(service.app.locals.store.db.prepare('SELECT count(*) AS n FROM places').get().n, 1,
    'publishing community entries must not insert data into the imported table');
  await service.close();
  const restarted = await f.start();
  const originalAddress = (await restarted.call('/api/locations?q=Testowa%2014')).body.locations.find(item => item.kind === 'address');
  assert(originalAddress.label.includes(sourcePlace().name),
    'a community website matching an OSM URL must not be treated as that imported record identity');
});

test('restart and source reimport preserve community facts, source provenance and dynamic renamed search', async t => {
  const f = await fixture(t); let service = await f.start(); const account = await service.register();
  assert.equal((await service.call('/api/locations?q=Testowa%2014')).body.total, 1,
    'source POIs must not duplicate their imported address row');
  let draft = await service.draft(account, sourcePlace().id);
  draft = await service.save(account, draft, content => {
    content.place.name = 'Muzeum Po Publikacji';
    content.place.website = 'https://museum.example.test/';
    content.fields.widthCm = { value: 84, sourceLabel: 'Pomiar testowy', sourceUrl: 'https://museum.example.test/entrance', observedAt: '2026-10-02' };
  });
  const saved = await service.publish(account, draft);
  assert.equal((await service.call('/api/locations?q=Testowa%2014')).body.total, 1,
    'a published POI with the same source address must not add a duplicate address result');
  let search = await service.call('/api/locations?q=Muzeum%20Po%20Publikacji');
  assert.equal(search.body.locations.filter(item => item.id === sourcePlace().id).length, 1);
  const namedAddressPath = `/api/locations?q=${encodeURIComponent('Testowa 14 Muzeum Po Publikacji')}`;
  let namedAddress = (await service.call(namedAddressPath)).body.locations.find(item => item.kind === 'address');
  assert(namedAddress, 'published names update the address association immediately');
  assert.match(namedAddress.label, /Muzeum Po Publikacji/);
  assert.deepEqual(namedAddress.coordinates, sourcePlace().coordinates);
  assert.equal((await service.call(`/api/locations?q=${encodeURIComponent('Testowa 14 Wyłącznie')}`)).body.total, 0,
    'the address index must not keep the old business name');
  const originalRow = JSON.parse(service.app.locals.store.db.prepare('SELECT data FROM places WHERE id=?').get(sourcePlace().id).data);
  assert.equal(originalRow.name, sourcePlace().name); assert.equal(originalRow.access.widthCm, 90);
  await service.close();
  const updatedSource = { ...sourcePlace(), name: 'Nowa nazwa z importu', osmUpdatedAt: '2026-10-02T10:00:00.000Z',
    access: { ...sourcePlace().access, widthCm: 80 } };
  f.writePlaces([updatedSource]); service = await f.start();
  const publicPassport = (await service.call(`/api/place-passports/${sourcePlace().id}`)).body;
  assert.equal(publicPassport.place.name, 'Muzeum Po Publikacji'); assert.equal(publicPassport.revision, 1);
  assert.equal(publicPassport.sourcePlace.name, 'Nowa nazwa z importu');
  assert.equal(publicPassport.sourcePlace.provenance.datasetId, 'osm-geofabrik-malopolskie');
  assert.equal(publicPassport.sourcePlace.provenance.recordUpdatedAt, updatedSource.osmUpdatedAt);
  assert.equal(publicPassport.fields.widthCm.status, 'conflict');
  assert.deepEqual(publicPassport.fields.widthCm.evidence.map(item => item.value), [80, 84]);
  assert.equal(publicPassport.fields.widthCm.evidence[0].observedAt, null);
  assert.equal(publicPassport.fields.widthCm.evidence[1].observedAt, '2026-10-02');
  assert.equal(publicPassport.fields.widthCm.evidence[1].id, saved.passport.fields.widthCm.evidence[1].id);
  const detail = (await service.call(`/api/places/${sourcePlace().id}`)).body;
  assert.equal(detail.name, 'Muzeum Po Publikacji'); assert.equal(detail.access.widthCm, null);
  assert.equal(detail.provenance, undefined, 'the aggregate must not label user facts with imported provenance');
  const sourceRow = JSON.parse(service.app.locals.store.db.prepare('SELECT data FROM places WHERE id=?').get(sourcePlace().id).data);
  assert.equal(sourceRow.access.widthCm, 80); assert.equal(sourceRow.name, updatedSource.name);
  search = await service.call('/api/locations?q=Muzeum%20Po%20Publikacji');
  assert.equal(search.body.locations.filter(item => item.id === sourcePlace().id).length, 1);
  namedAddress = (await service.call(namedAddressPath)).body.locations.find(item => item.kind === 'address');
  assert(namedAddress, 'restart must retain the original OSM source identity used for the address join');
  assert.match(namedAddress.label, /Muzeum Po Publikacji/);
  assert.equal((await service.call(`/api/place-passports/drafts/${draft.id}`, { token: account.token })).body.baseRevision, 1);
});

test('large valid passports use the 128kb parser while unrelated mutation routes retain their 16kb limit', async t => {
  const f = await fixture(t), service = await f.start(), account = await service.register();
  let draft = await service.draft(account);
  const largeText = 'Wyłącznie testowy opis warunków wejścia. '.repeat(25);
  draft = await service.save(account, draft, content => {
    Object.assign(content.place, { name: 'Duży paszport testowy', category: 'services', address: 'Testowa 80', coordinates: [19.943, 50.063] });
    content.entrances = Array.from({ length: 8 }, (_, index) => {
      const fields = emptyPassportFields();
      for (const field of PASSPORT_FIELD_DEFINITIONS) {
        fields[field.key] = { value: field.type === 'text' ? largeText : field.type === 'number' ? 20 : 'yes',
          sourceLabel: 'Wyłącznie testowe źródło '.repeat(6), sourceUrl: `https://example.test/${'source/'.repeat(20)}`, observedAt: null };
      }
      return { id: `entry-${index}`, label: `Wejście testowe ${index}`, coordinates: null, fields };
    });
    const size = Buffer.byteLength(JSON.stringify({ content }));
    assert(size > 16 * 1024 && size < 128 * 1024, `Fixture body: ${size} bytes`);
  });
  const saved = await service.publish(account, draft);
  assert.equal(saved.passport.entrances.length, 8);
  const oversized = await service.call(`/api/place-passports/drafts/${draft.id}`, { method: 'PUT', token: account.token,
    body: { content: { padding: 'x'.repeat(130 * 1024) }, expectedDraftVersion: saved.draft.draftVersion } });
  assert.equal(oversized.status, 413);
  const report = await service.call('/api/reports', { method: 'POST', token: account.token,
    body: { kind: 'width', coordinates: [19.943, 50.063], description: 'Wyłącznie testowe zgłoszenie.', padding: 'x'.repeat(17 * 1024) } });
  assert.equal(report.status, 413);
  assert.equal(service.app.locals.store.reports().length, 0);
  assert.equal((await service.call(`/api/place-passports/${draft.placeId}`)).body.revision, 1);
});
