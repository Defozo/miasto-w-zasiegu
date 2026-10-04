import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerLocations } from '../../server/locations.mjs';
import { openStore } from '../../server/store.mjs';
import { municipalStopFromFeature, MUNICIPAL_STOPS_SOURCE } from '../../server/municipal-stops.mjs';

const origin = [19.938, 50.061];
const location = (id, coordinates = origin, overrides = {}) => ({ id, label: 'Testowa 1, Kraków', coordinates,
  kind: 'address', precision: 'address', sourceUrl: `https://www.openstreetmap.org/node/${id}`,
  sourceLabel: 'Test fixture; entrance not checked', ...overrides });

async function fixture(locations, places, run, store = {
  places: () => places,
  municipalPlaces: () => places.filter(p => p.id?.startsWith('ztp-stop-') || p.provenance?.datasetId === 'ztp-kmk-stops'),
}) {
  const dir = mkdtempSync(join(tmpdir(), 'cracow-addresses-')), path = join(dir, 'locations.json');
  writeFileSync(path, JSON.stringify({ source: { label: 'Test data' }, locations }));
  const app = express(); registerLocations(app, { store }, path);
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  try {
    await run(async (q, limit = 20) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/locations?q=${encodeURIComponent(q)}&limit=${limit}`);
      assert.equal(response.status, 200); return response.json();
    });
  } finally { await new Promise(resolve => server.close(resolve)); rmSync(dir, { recursive: true, force: true }); }
}

test('different named objects sharing one address remain selectable even at identical coordinates', async () => {
  const locations = [location('1'), location('2'), location('3', [19.9385, 50.061])];
  const places = locations.map((p, index) => ({ id: `poi-${p.id}`, name: ['Muzeum Alfa', 'Kawiarnia Beta', 'Galeria Gamma'][index], sourceUrl: p.sourceUrl, coordinates: p.coordinates }));
  await fixture(locations, places, async query => {
    const result = await query('Testowa 1');
    assert.equal(result.total, 3); assert.equal(new Set(result.locations.map(p => p.label)).size, 3);
    for (const p of result.locations) assert.equal(p.label, `Testowa 1, Kraków · ${places.find(place => place.sourceUrl === p.sourceUrl).name}`);
    const named = await query('Testowa 1 Kawiarnia Beta');
    assert.equal(named.total, 1); assert.equal(named.locations[0].id, '2');
  });
});

test('nearly coincident duplicate representations collapse but buildings 20m apart are not merged', async () => {
  const locations = [location('1'), location('2', [19.938001, 50.061]), location('3', [19.9383, 50.061])];
  await fixture(locations, [], async query => {
    const result = await query('Testowa 1');
    assert.equal(result.total, 2);
    assert.equal(new Set(result.locations.map(p => p.label)).size, 2);
    assert(result.locations.every(p => p.addressLabel === 'Testowa 1, Kraków' && / · punkt adresowy [12]$/.test(p.label)));
    assert(result.locations.every(p => !/50\.061|19\.938/.test(p.label) && /w linii prostej/.test(p.disambiguationHint)));
    assert.deepEqual(result.locations.find(p => p.id === '3').coordinates, [19.9383, 50.061]);
  });
});

test('repeated distant address and matching business names remain distinct; search uses exact house numbers', async () => {
  const locations = [location('1'), location('2', [20.01, 50.1]), location('3', [19.94, 50.06], { label: 'Testowa 120, Kraków' })];
  const places = locations.map(p => ({ id: `poi-${p.id}`, name: p.id === '3' ? 'Galeria 1' : 'Ten sam sklep', sourceUrl: p.sourceUrl, coordinates: p.coordinates }));
  await fixture(locations, places, async query => {
    const result = await query('Testowa 1');
    assert.equal(result.total, 2); assert.equal(new Set(result.locations.map(p => p.label)).size, 2);
    assert(result.locations.every(p => p.label.includes('Ten sam sklep · punkt adresowy ')));
    assert(!result.locations.some(p => p.id === '3'));
    const limited = await query('Testowa 1', 1); assert.equal(limited.total, 2); assert.equal(limited.locations.length, 1);
  });
});

test('anonymous address points explain separation from a sourced name without inventing an entrance or a building', async () => {
  const locations = [location('1', [19.9386605, 50.0671241], { coordinateKind: 'osm-node' }),
    location('2', [19.9384226, 50.0670497], { coordinateKind: 'osm-node' }),
    location('3', [19.9387, 50.0674], { coordinateKind: 'representative-center' })];
  const places = [{ id: 'poi-2', name: 'Fornir', sourceUrl: locations[1].sourceUrl, coordinates: locations[1].coordinates }];
  await fixture(locations, places, async query => {
    const result = await query('Testowa 1');
    const node = result.locations.find(p => p.id === '1'), object = result.locations.find(p => p.id === '3');
    assert.equal(node.label, 'Testowa 1, Kraków · punkt adresowy 1');
    assert.equal(node.disambiguationHint, 'Inny punkt tego samego adresu, około 19 m w linii prostej od Fornir. Wejście niezweryfikowane.');
    assert.equal(node.coordinateKind, 'osm-node'); assert.deepEqual(node.coordinates, locations[0].coordinates);
    assert.match(object.disambiguationHint, /Przybliżone położenie obiektu\. Wejście niezweryfikowane\./);
    assert(!result.locations.some(p => /adres budynku|dostępne wejście/.test(p.label)));
    const limited = await query('Testowa 1', 2);
    for (const p of limited.locations) assert.equal(p.label, result.locations.find(other => other.id === p.id).label);
  });
});

test('nearby OSM and ZTP stops remain independently selectable with municipal provenance and no accessibility claim', async () => {
  const osm = { id: 'osm-node-901', name: 'Przystanek Nad Wisłą', coordinates: origin,
    sourceLabel: 'OpenStreetMap', sourceUrl: 'https://www.openstreetmap.org/node/901', coordinateKind: 'osm-node' };
  const ztp = { id: 'ztp-stop-stable-global-id', name: osm.name, coordinates: [19.9381, 50.061],
    sourceLabel: 'Zarząd Transportu Publicznego w Krakowie (ZTP)',
    sourceUrl: 'https://example.invalid/FeatureServer/0/query?objectIds=100&f=pjson', coordinateKind: 'source-point',
    municipalFacts: { stopId: '100', heavyUnneededPayload: 'not in autocomplete' },
    provenance: { importedAt: '2026-10-03T10:00:00Z' } };
  await fixture([], [osm, ztp], async query => {
    const result = await query('Przystanek Nad Wisłą');
    assert.equal(result.total, 2);
    const municipal = result.locations.find(p => p.id === ztp.id);
    assert(municipal);
    assert.deepEqual(municipal.coordinates, ztp.coordinates);
    assert.equal(municipal.sourceLabel, ztp.sourceLabel);
    assert.equal(municipal.sourceUrl, ztp.sourceUrl);
    assert.equal(municipal.coordinateKind, 'source-point');
    assert.equal(municipal.precision, 'approximate');
    assert.match(municipal.disambiguationHint, /źródła miejskiego ZTP/);
    assert.match(municipal.disambiguationHint, /nie potwierdza dostępności peronu ani dojścia/);
    assert.equal(municipal.municipalFacts, undefined);
    assert.equal(municipal.provenance, undefined);
    assert.equal(municipal.access, undefined);
    assert.equal(result.locations.find(p => p.id === osm.id).coordinateKind, 'osm-node');
    const limited = await query('Przystanek Nad Wisłą', 1);
    assert.equal(limited.total, 2);
    assert.equal(limited.locations.length, 1);
  });
});

test('different municipal records are not collapsed by a shared dataset URL or by proximity', async () => {
  const base = { name: 'Przystanek testowy', sourceLabel: 'ZTP',
    sourceUrl: 'https://example.invalid/public-dataset', coordinateKind: 'source-point' };
  const places = [
    { ...base, id: 'ztp-stop-1', coordinates: origin },
    { ...base, id: 'ztp-stop-2', coordinates: [19.93801, 50.061] },
    { ...base, id: 'ztp-stop-3', coordinates: [20.1, 50.1] },
  ];
  await fixture([], places, async query => {
    const result = await query('Przystanek testowy');
    assert.equal(result.total, 3);
    assert.deepEqual(new Set(result.locations.map(p => p.id)), new Set(places.map(p => p.id)));
  });
});

test('OSM duplicate heuristics still collapse nearby representations while external records retain their IDs', async () => {
  const name = 'Wspólny punkt';
  const places = [
    { id: 'osm-node-111', name, coordinates: origin, sourceLabel: 'OpenStreetMap', sourceUrl: 'https://www.openstreetmap.org/node/111' },
    { id: 'osm-way-222', name, coordinates: [19.93801, 50.061], sourceLabel: 'OpenStreetMap', sourceUrl: 'https://www.openstreetmap.org/way/222' },
    { id: 'ztp-stop-333', name, coordinates: origin, sourceLabel: 'ZTP', sourceUrl: 'https://example.invalid/333' },
    { id: 'ztp-stop-333', name, coordinates: origin, sourceLabel: 'ZTP', sourceUrl: 'https://example.invalid/333' },
  ];
  await fixture([], places, async query => {
    const result = await query(name);
    assert.equal(result.total, 2);
    assert.equal(result.locations.filter(p => p.id.startsWith('osm-')).length, 1);
    assert.equal(result.locations.filter(p => p.id === 'ztp-stop-333').length, 1);
  });
});

test('municipal autocomplete reloads replacements and expiry without rebuilding the address and OSM index', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'cracow-live-locations-'));
  const placesPath = join(dir, 'places.json'), municipalPath = join(dir, 'municipal-stops.json');
  const initialTime = Date.parse('2026-10-03T10:00:00Z');
  let now = initialTime, store;
  t.after(() => { store?.close(); rmSync(dir, { recursive: true, force: true }); });
  const osm = { id: 'osm-node-701', name: 'Przystanek testowy OSM', coordinates: origin,
    sourceLabel: 'OpenStreetMap', sourceUrl: 'https://www.openstreetmap.org/node/701' };
  writeFileSync(placesPath, JSON.stringify({ source: { label: 'OSM places', datasetId: 'osm-fixture' }, places: [osm] }));
  const stop = (id, name, validUntil = null) => municipalStopFromFeature({
    geometry: { x: origin[0], y: origin[1] },
    attributes: { OBJECTID: id, Nazwa_przystanku_nr: name, Typ_przystanku: 'A', Grupa: 'KMK', validUntil },
  }, { fetchedAt: new Date(initialTime).toISOString(), sourceUpdatedAt: null, now: initialTime }).place;
  const expiring = stop(1, 'Przystanek testowy czasowy', initialTime + 1000);
  const removed = stop(2, 'Przystanek testowy usunięty');
  const replacement = stop(3, 'Przystanek testowy po aktualizacji');
  const snapshot = records => writeFileSync(municipalPath, JSON.stringify({
    schemaVersion: 1, source: MUNICIPAL_STOPS_SOURCE,
    sync: { status: 'success', lastAttemptAt: new Date(now).toISOString(), lastSuccessAt: new Date(now).toISOString() },
    places: records,
  }));
  snapshot([expiring, removed]);
  store = openStore(':memory:', placesPath, { municipalPath, now: () => now });
  let fullIndexReads = 0, municipalReads = 0;
  const readPlaces = store.places, readMunicipal = store.municipalPlaces;
  store.places = () => { fullIndexReads++; return readPlaces(); };
  store.municipalPlaces = () => { municipalReads++; return readMunicipal(); };
  await fixture([location('address')], [], async query => {
    const initial = await query('Przystanek testowy');
    assert.deepEqual(new Set(initial.locations.map(p => p.id)), new Set([osm.id, expiring.id, removed.id]));
    assert.equal(initial.source.label, 'Test data');
    assert.equal(initial.source.scope, 'address-base');
    assert.deepEqual(initial.source.placeSources.map(s => s.datasetId), ['osm-fixture', 'ztp-kmk-stops']);

    snapshot([expiring, replacement]);
    const updated = await query('Przystanek testowy');
    assert.deepEqual(new Set(updated.locations.map(p => p.id)), new Set([osm.id, expiring.id, replacement.id]));
    assert.equal((await query('usunięty')).total, 0);
    assert.equal((await query('po aktualizacji')).locations[0].sourceUrl, replacement.sourceUrl);

    now = initialTime + 1000;
    const expired = await query('Przystanek testowy');
    assert.deepEqual(new Set(expired.locations.map(p => p.id)), new Set([osm.id, replacement.id]));
    assert.equal((await query('czasowy')).total, 0);
    assert.equal((await query('Testowa 1')).locations[0].id, 'address');
    assert.equal(fullIndexReads, 1, 'the full OSM index is loaded only during registration');
    assert.equal(municipalReads, 7, 'each non-empty query reads the current lightweight layer');
  }, store);
});
