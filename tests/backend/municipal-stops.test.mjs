import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MUNICIPAL_STOP_FIELDS, MUNICIPAL_STOPS_SOURCE, municipalStopFromFeature, syncMunicipalStops, createMunicipalStopsLayer } from '../../server/municipal-stops.mjs';
import { openStore } from '../../server/store.mjs';

const NOW = Date.parse('2026-10-03T10:00:00Z');
const meta = () => ({ fields: MUNICIPAL_STOP_FIELDS.map(name => ({ name })),
  advancedQueryCapabilities: { supportsPagination: true, supportsOrderBy: true },
  editingInfo: { dataLastEditDate: NOW - 86400000 }, dateFieldsTimeReference: { timeZone: 'UTC' } });
const feature = (id, changes = {}, geometry = { x: 19.94509, y: 50.06400 }) => ({ geometry, attributes: {
  OBJECTID: id, GlobalID: `${String(id).padStart(8, '0')}-1111-2222-3333-444444444444`,
  kod_busman: `801-0${id}`, Nazwa_przystanku_nr: `Przystanek testowy ${id}`, Typ_przystanku: 'A',
  Nawierzchnia_peronu: 'kostka', Krawężnik_peronowy: 'kassel-kerb', Ławki_poza_wiatą: 4,
  Wiata_liczba: 1, EditDate: NOW - 2 * 86400000, validFrom: null, validUntil: null, Grupa: 'KMK',
  Editor: 'MUST_NOT_LEAVE_SOURCE', ...changes,
} });
const response = data => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
function source(features, { intercept, modified = false } = {}) {
  const calls = []; let metaReads = 0;
  return { calls, fetchImpl: async (url, options) => {
    const u = new URL(url); calls.push({ url: u, options });
    const override = intercept?.(u, calls.length);
    if (override) return override;
    if (!u.pathname.endsWith('/query')) {
      const m = meta(); if (modified && ++metaReads > 1) m.editingInfo.dataLastEditDate++;
      return response(m);
    }
    if (u.searchParams.get('returnCountOnly') === 'true') return response({ count: features.length });
    const offset = Number(u.searchParams.get('resultOffset')), size = Number(u.searchParams.get('resultRecordCount'));
    return response({ spatialReference: { wkid: 4326 }, features: features.slice(offset, offset + size), exceededTransferLimit: offset + size < features.length });
  } };
}
function temporary(t) {
  const dir = mkdtempSync(join(tmpdir(), 'przejscie-municipal-'));
  const disposals = [];
  t.after(() => { for (const dispose of disposals) dispose(); rmSync(dir, { recursive: true, force: true }); });
  return { dir, path: join(dir, 'municipal-stops.json'), dispose: fn => disposals.push(fn) };
}
const sync = (path, mock, options = {}) => syncMunicipalStops({ path, fetchImpl: mock.fetchImpl, now: () => NOW, ...options });

test('pages the entire bounded source and excludes inactive, private, virtual, expired and outside-area stops', async t => {
  const { path } = temporary(t);
  const rows = [feature(1), feature(2, { Grupa: 'KMK_inny' }), feature(3, { Grupa: 'KMK_zawieszony' }),
    feature(4, { validUntil: NOW }), feature(5, { validFrom: NOW + 1 }), feature(6, { Typ_przystanku: 'wA' }),
    feature(7, {}, { x: 21, y: 50 }), feature(8, { validFrom: NOW - 1, validUntil: NOW + 1000 }),
    feature(9, { validUntil: 'wrong' })];
  const mock = source(rows), snapshot = await sync(path, mock, { pageSize: 2 });
  assert.equal(snapshot.sync.status, 'success');
  assert.equal(snapshot.sync.counts.pages, 5);
  assert.equal(snapshot.sync.counts.received, 9);
  assert.deepEqual(snapshot.places.map(p => p.provenance.objectId), [1, 8]);
  for (const { url, options } of mock.calls) {
    assert.equal(url.hostname, 'services-eu1.arcgis.com');
    assert.equal(options.redirect, 'error');
    if (!url.pathname.endsWith('/query')) continue;
    assert.equal(url.searchParams.get('geometry'), '19.75,49.9,20.25,50.2');
    assert.equal(url.searchParams.get('inSR'), '4326');
    if (url.searchParams.has('outFields')) {
      assert(!url.searchParams.get('outFields').includes('Editor'));
      assert.equal(url.searchParams.get('orderByFields'), 'OBJECTID ASC');
    }
  }
});

test('keeps source dates and exact factual limits without inferring wheelchair access', async t => {
  const { path } = temporary(t), snapshot = await sync(path, source([feature(1)]));
  const p = snapshot.places[0];
  assert.equal(p.access.wheelchair, 'unknown'); assert.equal(p.access.surface, null);
  assert.equal(p.access.widthCm, null); assert.equal(p.verifiedAt, null);
  assert.equal(p.municipalFacts.platformSurface, 'Kostka');
  assert.equal(p.municipalFacts.benchesOutsideShelter, 4);
  assert.equal(p.provenance.fetchedAt, '2026-10-03T10:00:00.000Z');
  assert.equal(p.provenance.recordUpdatedAt, '2026-10-01T10:00:00.000Z');
  assert.equal(p.provenance.sourceUpdatedAt, '2026-10-02T10:00:00.000Z');
  assert.equal(p.provenance.termsUrl, MUNICIPAL_STOPS_SOURCE.termsUrl);
  assert.equal(new URL(p.sourceUrl).searchParams.get('objectIds'), '1');
  assert(!JSON.stringify(snapshot).includes('MUST_NOT_LEAVE_SOURCE'));
  assert(!JSON.stringify(snapshot).includes('Editor'));
  assert(!('osmUpdatedAt' in p));
  const unknown = municipalStopFromFeature(feature(2, { Ławki_poza_wiatą: -3, Wiata_liczba: null, Nawierzchnia_peronu: null }),
    { fetchedAt: p.provenance.fetchedAt, sourceUpdatedAt: null, now: NOW }).place;
  assert.equal(unknown.municipalFacts.benchesOutsideShelter, null);
  assert.equal(unknown.municipalFacts.shelters, null);
  assert.equal(unknown.municipalFacts.platformSurface, null);
});

test('an HTTP failure retains the last successful records and dates, then recovers on the next run', async t => {
  const { path, dir } = temporary(t), initial = await sync(path, source([feature(1)]));
  const savedBackup = readFileSync(`${path}.last-good.json`, 'utf8');
  const failed = await sync(path, { fetchImpl: async () => new Response('Unavailable', { status: 503 }) }, { now: () => NOW + 10000 });
  assert.equal(failed.sync.status, 'error'); assert.equal(failed.sync.error.code, 'SOURCE_HTTP_ERROR');
  assert.deepEqual(failed.places, initial.places);
  assert.equal(failed.sync.lastSuccessAt, initial.sync.lastSuccessAt);
  assert.equal(readFileSync(`${path}.last-good.json`, 'utf8'), savedBackup);
  assert.equal(JSON.parse(readFileSync(path, 'utf8')).sync.status, 'error');
  assert(!readdirSync(dir).some(file => /\.tmp$|\.lock$/.test(file)));
  const recovered = await sync(path, source([feature(1, { Ławki_poza_wiatą: 2 })]), { now: () => NOW + 20000 });
  assert.equal(recovered.sync.status, 'success'); assert.equal(recovered.places[0].municipalFacts.benchesOutsideShelter, 2);
});

test('first import failure creates an explicit unavailable snapshot, never fabricated places', async t => {
  const { path } = temporary(t);
  const result = await sync(path, { fetchImpl: async () => { throw new Error('private connection detail'); } });
  assert.equal(result.sync.status, 'error'); assert.equal(result.sync.lastSuccessAt, null);
  assert.deepEqual(result.places, []);
  assert(!readFileSync(path, 'utf8').includes('private connection detail'));
});

test('truncated pagination, duplicate pages, schema change and source edits never replace a good snapshot', async t => {
  const { path } = temporary(t), initial = await sync(path, source([feature(1), feature(2)]));
  const broken = [
    source([feature(1), feature(2)], { intercept: u => u.searchParams.has('resultOffset')
      ? response({ spatialReference: { wkid: 4326 }, features: [feature(1)], exceededTransferLimit: false }) : null }),
    source([feature(1), feature(1)]),
    source([feature(1), feature(2)], { modified: true }),
    source([feature(1)], { intercept: u => !u.pathname.endsWith('/query') ? response({ ...meta(), fields: [] }) : null }),
    source([]),
  ];
  for (const mock of broken) {
    const result = await sync(path, mock, { pageSize: 1 });
    assert.equal(result.sync.status, 'error'); assert.deepEqual(result.places, initial.places);
  }
});

test('loader filters validity continuously and marks old or failed data without losing provenance', async t => {
  const { path } = temporary(t);
  await sync(path, source([feature(1), feature(2, { validUntil: NOW + 1000 })]));
  let now = NOW;
  const layer = createMunicipalStopsLayer(path, { now: () => now });
  assert.equal(layer.current().places.length, 2);
  now += 1000;
  assert.equal(layer.current().places.length, 1);
  now += 49 * 3600000;
  assert.equal(layer.current().status.stale, true);
  assert.equal(layer.current().places[0].provenance.stale, true);
  writeFileSync(path, '{ invalid json');
  const cached = layer.current();
  assert.equal(cached.status.status, 'error'); assert.equal(cached.places.length, 1);
  const freshLoader = createMunicipalStopsLayer(path, { now: () => now });
  assert.equal(freshLoader.current().places.length, 1);
  assert.equal(freshLoader.current().status.status, 'error');
});

test('optional layer preserves OSM independently, reloads after imports and never persists municipal ghosts in SQLite', async t => {
  const { path, dir, dispose } = temporary(t);
  const placesPath = join(dir, 'places.json'), dbPath = join(dir, 'app.sqlite');
  const osm = { id: 'osm-node-123', name: 'Przystanek testowy 1', coordinates: [19.94509, 50.06400],
    category: 'transport', access: { wheelchair: 'unknown' }, verifiedAt: null, osmUpdatedAt: '2020-01-01T00:00:00Z', sourceUrl: 'https://www.openstreetmap.org/node/123' };
  writeFileSync(placesPath, JSON.stringify({ source: { label: 'OSM', snapshotDate: '2026-10-01T00:00:00Z' },
    importedAt: '2026-10-02T00:00:00Z', places: [osm] }));
  let store = openStore(dbPath, placesPath, { now: () => NOW });
  dispose(() => store.close());
  assert.equal(store.places().length, 1); assert.equal(store.municipalStatus().status, 'missing');
  const initial = await sync(path, source([feature(1), feature(2)]));
  assert.equal(store.places().length, 2);
  const savedOSM = store.place(osm.id);
  assert.equal(savedOSM.id, osm.id); // Existing bookmarks remain usable.
  assert(savedOSM.sourceIds.includes(initial.places[0].id));
  const osmSource = savedOSM.relatedSources.find(source => source.datasetId === 'osm-geofabrik-malopolskie');
  assert.equal(osmSource.importedAt, '2026-10-02T00:00:00Z');
  assert.equal(osmSource.snapshotAt, '2026-10-01T00:00:00Z');
  assert(!('fetchedAt' in osmSource));
  assert.equal(store.source.datasets.length, 2);
  await sync(path, source([feature(2)]), { now: () => NOW + 1000 });
  assert.equal(store.places().length, 2);
  assert.equal(store.place(initial.places[0].id), null);
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM places').get().n, 1);
  store.close(); store = openStore(dbPath, placesPath, { now: () => NOW + 1000 });
  assert.equal(store.places().length, 2); assert(store.place(osm.id));
});

test('overlapping imports cannot erase a running import or its lock', async t => {
  const { path } = temporary(t);
  writeFileSync(`${path}.lock`, 'owned by another import');
  await assert.rejects(sync(path, source([feature(1)])), { code: 'IMPORT_LOCKED' });
  assert.equal(readFileSync(`${path}.lock`, 'utf8'), 'owned by another import');
});

test('a failed publication cannot hide a newer last-good copy behind an empty error snapshot', async t => {
  const { path } = temporary(t);
  const good = await sync(path, source([feature(1)]));
  // Models interruption after last-good was committed, before the main file was published.
  writeFileSync(path, JSON.stringify({ ...good, places: [], sync: { ...good.sync,
    status: 'error', lastSuccessAt: null, counts: null, error: { code: 'IMPORT_FAILED', message: 'Publication failed' } } }));
  const layer = createMunicipalStopsLayer(path, { now: () => NOW });
  assert.equal(layer.current().places.length, 1);
  assert.equal(layer.current().status.status, 'error');
  const failedAgain = await sync(path, { fetchImpl: async () => new Response('', { status: 503 }) });
  assert.deepEqual(failedAgain.places, good.places);
  assert.equal(failedAgain.sync.lastSuccessAt, good.sync.lastSuccessAt);
});

test('a future success timestamp cannot appear as a fresh successful synchronization', async t => {
  const { path } = temporary(t);
  await sync(path, source([feature(1)]));
  const layer = createMunicipalStopsLayer(path, { now: () => NOW - 10 * 60000 });
  assert.equal(layer.current().status.stale, true);
  assert.equal(layer.current().status.status, 'error');
});

test('a body failure after page one leaves all old rows and their original fetched date intact', async t => {
  const { path } = temporary(t), old = await sync(path, source([feature(1), feature(2)]));
  const mock = source([feature(1, { Ławki_poza_wiatą: 9 }), feature(2)], { intercept: url =>
    url.searchParams.get('resultOffset') === '1' ? new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode('{"features":[')); controller.error(new Error('stream disconnected')); },
    })) : null });
  const result = await sync(path, mock, { pageSize: 1, now: () => NOW + 60000 });
  assert(mock.calls.some(({ url }) => url.searchParams.get('resultOffset') === '1'));
  assert.equal(result.sync.status, 'error'); assert.equal(result.sync.error.code, 'SOURCE_UNAVAILABLE');
  assert.deepEqual(result.places, old.places);
  assert.equal(result.sync.lastSuccessAt, old.sync.lastSuccessAt);
});

test('saved future and expired validity is checked at read time, and unknown factual values never mean absent', async t => {
  const { path } = temporary(t);
  const data = await sync(path, source([feature(1, { Krawężnik_peronowy: 'new-code', Ławki_poza_wiatą: null }), feature(2), feature(3)]));
  data.places[1].municipalFacts.validFrom = new Date(NOW + 1000).toISOString();
  data.places[2].municipalFacts.validUntil = new Date(NOW).toISOString();
  writeFileSync(path, JSON.stringify(data));
  let now = NOW;
  const layer = createMunicipalStopsLayer(path, { now: () => now });
  assert.equal(layer.current().places.length, 1);
  const [place] = layer.current().places;
  assert.equal(place.access.wheelchair, 'unknown');
  assert.equal(place.municipalFacts.benchesOutsideShelter, null);
  assert.match(place.municipalFacts.kerbType, /Inny rodzaj/);
  assert.equal(place.provenance.rawFacts.Krawężnik_peronowy, 'new-code');
  now += 1000;
  assert.equal(layer.current().places.length, 2);
});

test('future source edit timestamps reject the update while preserving the last validated data', async t => {
  const { path } = temporary(t), original = await sync(path, source([feature(1)]));
  const futureRecord = await sync(path, source([feature(1, { EditDate: NOW + 10 * 60000 })]));
  assert.equal(futureRecord.sync.error.code, 'SOURCE_TIME_INVALID');
  assert.deepEqual(futureRecord.places, original.places);
  const futureLayer = await sync(path, source([feature(1)], { intercept: url => !url.pathname.endsWith('/query')
    ? response({ ...meta(), editingInfo: { dataLastEditDate: NOW + 10 * 60000 } }) : null }));
  assert.equal(futureLayer.sync.error.code, 'SOURCE_TIME_INVALID');
  assert.deepEqual(futureLayer.places, original.places);
  assert.equal(futureLayer.sync.lastSuccessAt, original.sync.lastSuccessAt);
});
