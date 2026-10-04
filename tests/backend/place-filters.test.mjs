import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { app as defaultApp, createApp } from '../../server/index.mjs';
import {
  DEFAULT_PLACE_FILTERS, hasPlaceFilters, matchesPlaceFilters, parsePlaceFilters, placeFiltersParams,
} from '../../shared/place-filters.mjs';

after(() => defaultApp.locals.store.close());

const place = (id, extra = {}) => ({
  id, name: id, category: 'toilet', coordinates: [19.938, 50.061], address: '', description: '',
  access: { wheelchair: 'unknown', toilet: 'unknown' },
  sourceLabel: 'Synthetic test fixture', ...extra,
});

async function serve(t, places) {
  const dir = mkdtempSync(join(tmpdir(), 'place-filters-'));
  const placesPath = join(dir, 'places.json');
  writeFileSync(placesPath, JSON.stringify({ source: { label: 'Synthetic test fixture' }, places }));
  const app = createApp({ dbPath: ':memory:', placesPath });
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    app.locals.store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return async (query = '') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/places${query ? `?${query}` : ''}`);
    return { status: response.status, body: await response.json() };
  };
}

test('filter query round trip preserves selections and omits disabled options', () => {
  assert.deepEqual(parsePlaceFilters({ q: 'Toaleta', category: 'toilet' }), DEFAULT_PLACE_FILTERS);
  assert.equal(hasPlaceFilters(DEFAULT_PLACE_FILTERS), false);
  assert.equal(placeFiltersParams(DEFAULT_PLACE_FILTERS), '');
  const filters = { ...DEFAULT_PLACE_FILTERS, wheelchair: 'yes', accessibleToilet: true, publicOnly: true };
  const encoded = placeFiltersParams(filters);
  assert.equal(encoded, 'wheelchair=yes&accessibleToilet=true&publicOnly=true');
  assert.deepEqual(parsePlaceFilters(new URLSearchParams(encoded)), filters);
  assert.equal(hasPlaceFilters(filters), true);
  assert.equal(hasPlaceFilters({ freeOnly: false }), false);
  assert.deepEqual(parsePlaceFilters({ accessibleToilet: 'false', placeType: 'all' }), DEFAULT_PLACE_FILTERS);
});

test('filter query rejects malformed values and repeated parameters', () => {
  for (const query of [
    { wheelchair: 'designated' }, { wheelchair: ['yes'] }, { placeType: 'toilet' },
    { freeOnly: '1' }, { freeOnly: true }, { open247: '' }, { backrest: 'True' },
    { armrest: ['true', 'false'] }, { accessibleToilet: { true: '' } },
    new URLSearchParams('wheelchair=yes&wheelchair=no'), new URLSearchParams('publicOnly=true&publicOnly=true'),
  ]) assert.throws(() => parsePlaceFilters(query), TypeError);
});

test('accessible toilets require a positive declaration and exclude conflicts and limitations', () => {
  const accessibleToilet = { accessibleToilet: true };
  assert.equal(matchesPlaceFilters(place('declared', { access: { wheelchair: 'unknown', toilet: 'yes' } }), accessibleToilet), true);
  assert.equal(matchesPlaceFilters(place('toilet-node', { access: { wheelchair: 'yes', toilet: 'unknown' } }), accessibleToilet), true);
  assert.equal(matchesPlaceFilters(place('cafe', { category: 'food', access: { wheelchair: 'yes', toilet: 'yes' } }), accessibleToilet), true);
  assert.equal(matchesPlaceFilters(place('cafe-unknown-toilet', { category: 'food', access: { wheelchair: 'yes' } }), accessibleToilet), false);
  assert.equal(matchesPlaceFilters(place('unknown'), accessibleToilet), false);
  assert.equal(matchesPlaceFilters(place('no-access-data', { access: undefined }), accessibleToilet), false);
  for (const access of [
    { wheelchair: 'yes', toilet: 'no' }, { wheelchair: 'yes', toilet: 'limited' },
    { wheelchair: 'no', toilet: 'yes' }, { wheelchair: 'limited', toilet: 'yes' },
    { wheelchair: 'limited', toilet: 'unknown' }, { wheelchair: 'unknown', toilet: 'limited' },
  ]) assert.equal(matchesPlaceFilters(place('conflict', { access }), accessibleToilet), false, JSON.stringify(access));
});

test('wheelchair status is exact and absent or unsupported values remain unknown', () => {
  for (const status of ['yes', 'limited', 'no', 'unknown']) {
    const candidate = place(status, { access: { wheelchair: status } });
    assert.equal(matchesPlaceFilters(candidate, { wheelchair: status }), true);
    for (const other of ['yes', 'limited', 'no', 'unknown'].filter(value => value !== status))
      assert.equal(matchesPlaceFilters(candidate, { wheelchair: other }), false);
  }
  for (const candidate of [place('missing', { access: undefined }), place('unsupported', { access: { wheelchair: 'designated' } })])
    assert.equal(matchesPlaceFilters(candidate, { wheelchair: 'unknown' }), true);
});

test('cost, public access and all-day filters exclude missing data and partial matches', () => {
  const filters = { freeOnly: true, publicOnly: true, open247: true };
  const candidate = place('known', { fee: 'no', accessRestriction: 'yes', openingHours: '24/7' });
  assert.equal(matchesPlaceFilters(candidate, filters), true);
  for (const accessRestriction of ['public', 'permissive'])
    assert.equal(matchesPlaceFilters({ ...candidate, accessRestriction }, filters), true);
  for (const extra of [
    { fee: null }, { fee: 'yes' }, { fee: 'no @ (Mo)' }, { accessRestriction: null },
    { accessRestriction: 'customers' }, { accessRestriction: 'private' }, { openingHours: null },
    { openingHours: 'Mo-Su 00:00-24:00' }, { openingHours: '24/7; PH off' },
  ]) assert.equal(matchesPlaceFilters({ ...candidate, ...extra }, filters), false, JSON.stringify(extra));
});

test('rest features match only benches with explicit corresponding tags', () => {
  const candidate = place('bench', { placeType: 'bench', bench: { backrest: 'yes', armrest: 'yes' } });
  assert.equal(matchesPlaceFilters(candidate, { placeType: 'bench', backrest: true, armrest: true }), true);
  assert.equal(matchesPlaceFilters({ ...candidate, placeType: 'park' }, { backrest: true }), false);
  assert.equal(matchesPlaceFilters({ ...candidate, bench: undefined }, { armrest: true }), false);
  assert.equal(matchesPlaceFilters({ ...candidate, bench: { backrest: 'no', armrest: 'yes' } }, { backrest: true, armrest: true }), false);
  assert.equal(matchesPlaceFilters({ ...candidate, bench: { backrest: 'yes', armrest: '2' } }, { armrest: true }), false);
});

test('API filters the whole collection before its limit and combines category with features', async t => {
  const places = Array.from({ length: 125 }, (_, index) => place(`unknown-${index}`));
  places.push(
    place('accessible-paid', { access: { wheelchair: 'yes', toilet: 'yes' }, fee: 'yes' }),
    place('accessible-free', { access: { wheelchair: 'yes', toilet: 'yes' }, fee: 'no' }),
    place('cafe', { category: 'food', access: { wheelchair: 'yes', toilet: 'yes' }, fee: 'no' }),
  );
  const request = await serve(t, places);
  const filtered = await request('accessibleToilet=true&limit=2');
  assert.equal(filtered.status, 200);
  assert.equal(filtered.body.total, 3);
  assert.deepEqual(filtered.body.places.map(p => p.id), ['accessible-paid', 'accessible-free']);
  const combined = await request('category=toilet&accessibleToilet=true&freeOnly=true&limit=100');
  assert.equal(combined.body.total, 1);
  assert.equal(combined.body.places[0].id, 'accessible-free');
  const search = await request('q=free&wheelchair=yes');
  assert.equal(search.body.total, 1);
  assert.equal(search.body.places[0].id, 'accessible-free');
});

test('API explicit bench filters include unnamed benches without a search or category', async t => {
  const request = await serve(t, [
    place('full-bench', { category: 'outdoors', name: 'Ławka', placeType: 'bench', bench: { backrest: 'yes', armrest: 'yes' } }),
    place('unknown-bench', { category: 'outdoors', name: 'Ławka', placeType: 'bench' }),
    place('museum', { category: 'culture', bench: { backrest: 'yes', armrest: 'yes' } }),
  ]);
  assert.deepEqual((await request()).body.places.map(p => p.id), ['museum']);
  assert.equal((await request('placeType=bench')).body.total, 2);
  for (const query of ['backrest=true', 'armrest=true', 'placeType=bench&backrest=true&armrest=true']) {
    const result = await request(query);
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.places.map(p => p.id), ['full-bench']);
  }
  assert.equal((await request('category=culture&placeType=bench')).body.total, 0);
});

test('API responds with 400 for invalid new filter parameters', async t => {
  const request = await serve(t, []);
  for (const query of [
    'wheelchair=invalid', 'wheelchair=yes&wheelchair=no', 'placeType=toilet', 'publicOnly=',
    'accessibleToilet=1', 'freeOnly=yes', 'open247=TRUE', 'backrest=0', 'armrest=true&armrest=false',
  ]) {
    const result = await request(query);
    assert.equal(result.status, 400, query);
    assert.equal(result.body.error.code, 'INVALID_INPUT');
  }
});
