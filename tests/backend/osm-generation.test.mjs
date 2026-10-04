import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { osmGeneration, OSM_FILES } from '../../server/osm-generation.mjs';
import { openStore } from '../../server/store.mjs';

test('generation pointer rejects missing layers and directory escape', t => {
  const root = mkdtempSync(join(tmpdir(), 'osm-generation-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(osmGeneration(root).directory, root);
  const pointer = join(root, 'osm-current.json');
  writeFileSync(pointer, JSON.stringify({ schemaVersion: 1, generation: '../../bad' }));
  assert.throws(() => osmGeneration(root), /Invalid/);
  const generation = '20261004T003000Z-12345678';
  writeFileSync(pointer, JSON.stringify({ schemaVersion: 1, generation }));
  assert.throws(() => osmGeneration(root), /Incomplete/);
  const directory = join(root, 'osm-generations', generation);
  mkdirSync(directory, { recursive: true });
  for (const file of OSM_FILES) writeFileSync(join(directory, file), 'test');
  assert.deepEqual(osmGeneration(root), { directory, generation });
});

test('OSM replacement removes deleted source rows and preserves community records', t => {
  const root = mkdtempSync(join(tmpdir(), 'osm-store-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, 'places.json'), database = join(root, 'app.sqlite');
  const row = id => ({ id, name: id, coordinates: [19.93, 50.06], category: 'culture' });
  writeFileSync(path, JSON.stringify({ source: {}, places: [row('osm-node-1'), row('osm-node-2'), row('community-place-x')] }));
  let store = openStore(database, path, { municipalPath: null });
  const report = store.addReport({ kind: 'steps', coordinates: [19.93, 50.06], description: 'Community report' });
  store.db.exec("CREATE TABLE import_test_user(id TEXT); INSERT INTO import_test_user VALUES ('preserve-me')");
  store.close();
  writeFileSync(path, JSON.stringify({ source: {}, places: [row('osm-node-2'), row('osm-node-3')] }));
  store = openStore(database, path, { municipalPath: null, replaceOsm: true });
  assert.equal(store.place('osm-node-1'), null);
  assert.ok(store.place('osm-node-3'));
  assert.ok(store.place('community-place-x'));
  assert.equal(store.getReport(report.id).description, 'Community report');
  assert.equal(store.db.prepare('SELECT id FROM import_test_user').get().id, 'preserve-me');
  store.close();
  writeFileSync(path, JSON.stringify({ source: {}, places: [] }));
  assert.throws(() => openStore(database, path, { replaceOsm: true }), /invalid snapshot/);
  // An invalid new snapshot was rejected before opening/mutating the live DB.
  writeFileSync(path, JSON.stringify({ source: {}, places: [row('osm-node-2'), row('osm-node-3')] }));
  store = openStore(database, path, { municipalPath: null });
  assert.ok(store.place('osm-node-3'));
  assert.ok(store.getReport(report.id));
  store.close();
});
