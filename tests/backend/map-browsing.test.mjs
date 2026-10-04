import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { app as defaultApp, createApp } from '../../server/index.mjs';

after(() => defaultApp.locals.store.close());

async function serve(t) {
  const dir = mkdtempSync(join(tmpdir(), 'map-browsing-'));
  const places = Array.from({ length: 235 }, (_, i) => ({
    id: `fixture-${i}`, name: `Miejsce testowe ${i}`, category: i < 220 ? 'culture' : 'food',
    coordinates: i < 180 ? [19.938 + i * 0.00001, 50.061] : [20.04 + i * 0.00001, 50.075],
    address: 'Dane przykładowe testu', description: 'Bez audytu terenowego',
    access: { wheelchair: i % 2 ? 'yes' : 'unknown', toilet: 'unknown' },
    sourceLabel: 'Izolowany test', sourceUrl: 'https://example.com/fixture', verifiedAt: null,
  }));
  const placesPath = join(dir, 'places.json');
  writeFileSync(placesPath, JSON.stringify({ source: { label: 'Izolowany test' }, places }));
  const app = createApp({ dbPath: ':memory:', placesPath });
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    app.locals.store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return async query => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/places?${query}`);
    return { status: response.status, body: await response.json() };
  };
}

test('map covers every matching point beyond the first page and outside the list area', async t => {
  const request = await serve(t);
  const { body } = await request('limit=100&includeMap=true&bbox=19.93,50.05,19.95,50.07');
  assert.equal(body.places.length, 100);
  assert.equal(body.total, 180);
  assert.equal(body.nextOffset, 100);
  assert.equal(body.mapPlaces.length, 235);
  assert(body.mapPlaces.some(p => p.coordinates[0] > 20.04));
  assert(body.mapPlaces.every(p => !('access' in p) && !('description' in p)));
  assert(body.places.every(p => p.sourceLabel === 'Izolowany test' && p.verifiedAt === null));
});

test('pages have no gaps or duplicates and terminate after the last result', async t => {
  const request = await serve(t);
  let offset = 0;
  const ids = [];
  do {
    const { body } = await request(`limit=100&offset=${offset}`);
    assert.equal(body.offset, offset);
    assert.equal(body.mapPlaces, undefined);
    ids.push(...body.places.map(p => p.id));
    offset = body.nextOffset;
  } while (offset !== null);
  assert.equal(ids.length, 235);
  assert.equal(new Set(ids).size, 235);
  const { body } = await request('offset=235');
  assert.deepEqual(body.places, []);
  assert.equal(body.nextOffset, null);
});

test('map and pages apply the same category, search and accessibility filters', async t => {
  const request = await serve(t);
  const { body } = await request('category=culture&wheelchair=yes&q=Miejsce&limit=100&includeMap=true');
  assert.equal(body.total, 110);
  assert.equal(body.mapPlaces.length, 110);
  const second = await request('category=culture&wheelchair=yes&q=Miejsce&offset=100');
  assert.equal(second.body.places.length, 10);
  assert.deepEqual(new Set([...body.places, ...second.body.places].map(p => p.id)), new Set(body.mapPlaces.map(p => p.id)));
  const none = await request('q=nieistniejace&includeMap=true');
  assert.deepEqual(none.body.mapPlaces, []);
  assert.equal(none.body.nextOffset, null);
});

test('invalid page and map parameters are rejected', async t => {
  const request = await serve(t);
  for (const query of ['offset=-1', 'offset=1.5', 'offset=', 'offset=abc', 'offset=1&offset=2', 'offset=9007199254740992', 'includeMap=1', 'includeMap=true&includeMap=false']) {
    assert.equal((await request(query)).status, 400, query);
  }
});
