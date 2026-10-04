import assert from 'node:assert/strict';
import { resolve } from 'node:path';
process.env.PRZEJSCIE_SKIP_DEFAULT_APP = '1';
const { createApp } = await import('../server/index.mjs');
const directory = resolve(process.argv[2]);
const api = createApp({ dbPath: ':memory:', placesPath: resolve(directory, 'places.json'),
  parkingsPath: resolve(directory, 'parkings.json'), locationsPath: resolve(directory, 'locations.json'),
  accessibilityPath: resolve(directory, 'accessibility.json'), municipalPath: null, municipalParkingsPath: null,
  fetchImpl: async () => new Response(JSON.stringify({ status: 'ready' })),
});
const server = api.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
try {
  const base = `http://127.0.0.1:${server.address().port}`;
  const health = await (await fetch(`${base}/api/health`)).json();
  const places = await (await fetch(`${base}/api/places?limit=1`)).json();
  const locations = await (await fetch(`${base}/api/locations?q=D%C5%82uga%2012`)).json();
  assert.equal(health.database, 'ready');
  assert.ok(health.accessibilityFeatures > 1000 && health.places > 1000);
  assert.ok(places.places.length && locations.locations.length);
  console.log(JSON.stringify({ status: 'passed', places: health.places, accessibilityFeatures: health.accessibilityFeatures,
    addressMatches: locations.locations.length, scope: 'Isolated in-memory API, no external routing test' }));
} finally {
  await new Promise(resolve => server.close(resolve));
  api.locals.store.close();
}
