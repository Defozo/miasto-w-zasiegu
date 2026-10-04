import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { calculateJourney } from '../../server/journeys.mjs';
import { ApiError } from '../../server/routing.mjs';
import { fuseMunicipalStops, fuseMunicipalParkings } from '../../server/place-fusion.mjs';
import { syncMunicipalParkings, createMunicipalParkingsLayer, municipalParkingFromFeature } from '../../server/municipal-parkings.mjs';

const body = { mode: 'car', start: [19.93, 50.06], end: [19.94, 50.06], profile: { mobility: 'manual', widthCm: 72, maxIncline: 5, maxKerbCm: 1, avoidUnpaved: true } };
const route = { distanceM: 500, durationS: 300, steps: [], geometry: { type: 'LineString', coordinates: [body.start, body.end] } };
const parking = (id, longitude = 19.939, extra = {}) => ({ id, coordinates: [longitude, 50.06], access: { wheelchair: 'unknown' }, parking: {}, ...extra });

test('nearby independent lots are tried; spaces in the same lot are not separate alternatives', async () => {
  const lots = [parking('failed'), parking('working', 19.9391), parking('space', 19.93911, { parking: { parentParkingId: 'working' } })];
  const calls = [];
  const result = await calculateJourney(body, lots, [], { drive: async () => route, onward: async input => {
    calls.push(input.start[0]);
    if (input.start[0] === 19.939) throw new ApiError(422, 'NO_ROUTE', 'No');
    return route;
  } });
  assert.deepEqual(result.alternatives.map(p => p.id), ['working']);
  assert.deepEqual(calls.sort(), [19.939, 19.9391]);
});
test('second mapped pedestrian exit is tried with unchanged needs', async () => {
  const item = parking('lot', 19.939, { parking: { vehicleEntrances: [{ coordinates: [19.938, 50.06] }],
    mobilityExits: [{ coordinates: [19.9395, 50.06] }, { coordinates: [19.939, 50.06] }] } });
  const profiles = [];
  const result = await calculateJourney(body, [item], [], { drive: async () => route, onward: async input => {
    profiles.push(input.profile);
    if (input.start[0] === 19.9395) throw new ApiError(422, 'NO_ROUTE', 'No', { orsCode: 2009 });
    return route;
  } });
  assert.equal(profiles.length, 2);
  assert.deepEqual(profiles[0], profiles[1]);
  assert.equal(profiles[1].widthCm, 72);
  assert.deepEqual(result.alternatives[0].transfer.mobilityExit, [19.939, 50.06]);
  assert.equal(result.alternatives[0].transfer.status, 'unknown');
});
test('failed legs retain exact cause and a service outage cannot be swallowed by a route failure', async () => {
  await assert.rejects(calculateJourney(body, [parking('lot')], [], {
    drive: async () => { throw new ApiError(422, 'CAR_ROUTE_UNAVAILABLE', 'No', { orsCode: 2010 }); },
    onward: async () => { throw new ApiError(422, 'NO_ROUTE', 'No', { orsCode: 2009 }); },
  }), error => {
    assert.equal(error.code, 'NO_JOURNEY'); assert.match(error.message, /Parkingi są na mapie/);
    assert.equal(error.details.checkedParkings, 1);
    assert.deepEqual(error.details.failures[0].failures.map(f => [f.leg, f.orsCode]), [['drive', 2010], ['onward', 2009]]);
    return true;
  });
  await assert.rejects(calculateJourney(body, [parking('lot')], [], {
    drive: async () => { throw new ApiError(422, 'CAR_ROUTE_UNAVAILABLE', 'No'); },
    onward: async () => { await new Promise(r => setTimeout(r, 5)); throw new ApiError(503, 'ROUTING_UNAVAILABLE', 'Offline'); },
  }), error => error.code === 'ROUTING_UNAVAILABLE');
});
test('restricted driveways and pedestrian exits do not snap to an unrelated road', async () => {
  for (const extra of [{ accessRestriction: 'private;customers' }, { parking: { vehicleAccess: 'restricted' } }, { accessRestriction: 'permit' }, { name: 'Kiss & Ride' }]) {
    await assert.rejects(calculateJourney(body, [parking('lot', 19.939, extra)], [], {}), error => error.code === 'NO_PARKING' && error.details.nearbyParkings === 1);
  }
  let onwardCalled = false;
  await assert.rejects(calculateJourney(body, [parking('lot', 19.939, { parking: { mobilityAccess: 'restricted' } })], [], {
    drive: async () => route, onward: async () => { onwardCalled = true; return route; },
  }), error => error.details.failures[0].failures[0].code === 'MISSING_PARKING_EXIT');
  assert.equal(onwardCalled, false);
});

const stop = (id, name, longitude = 19.939) => ({ id, name, category: 'transport', coordinates: [longitude, 50.06], access: { wheelchair: 'unknown' }, provenance: { datasetId: id } });
test('fusion requires a single matching numbered platform on both sides', () => {
  const osm = stop('osm-node-1', 'Teatr Słowackiego 03');
  const city = { ...stop('ztp-stop-a', 'Teatr Słowackiego 03', 19.9391), municipalFacts: { platformSurface: 'Asfalt' } };
  const fused = fuseMunicipalStops([osm], [city]);
  assert.equal(fused.length, 1); assert.deepEqual(fused[0].sourceIds, [city.id, osm.id]);
  assert.equal(fused[0].municipalFacts.platformSurface, 'Asfalt'); assert.equal(fused[0].relatedSources[0].datasetId, osm.id);
  assert.equal(fuseMunicipalStops([osm], [{ ...city, name: 'Teatr Słowackiego 04' }]).length, 2);
  assert.equal(fuseMunicipalStops([osm, { ...osm, id: 'osm-node-2' }], [city]).length, 3);
  assert.equal(fuseMunicipalStops([osm], [city, { ...city, id: 'ztp-stop-b' }]).length, 3);
  assert.equal(fuseMunicipalStops([osm], [{ ...city, coordinates: [19.94, 50.06] }]).length, 2);
});

const feature = { attributes: { OBJECTID: 1, Nazwa: 'P+R Test', m_ogolem: 167, m_niepełnosp: 7, m_elektryczne: 2, doba_parkingowa: '04:30 - 02:30' }, geometry: { x: 19.939, y: 50.06 } };
const fetchedAt = '2026-10-03T10:00:00Z', sourceUpdatedAt = '2026-01-30T13:08:42.925Z';
test('parking fusion keeps city capacity conflicts and OSM entrances, never creates an accessible transfer', () => {
  const city = municipalParkingFromFeature(feature, { fetchedAt, sourceUpdatedAt });
  const osm = parking('osm-way-1', 19.939, { name: 'Parking', parking: { capacity: '160', vehicleEntrance: [19.9388, 50.06], area: [[19.938, 50.059], [19.94, 50.059], [19.94, 50.061], [19.938, 50.061], [19.938, 50.059]] } });
  const fused = fuseMunicipalParkings([osm], [city]);
  assert.equal(fused.length, 1); assert.equal(fused[0].parking.capacity, '160');
  assert.equal(fused[0].municipalParkingFacts.capacity, 167); assert.equal(fused[0].dataConflicts.length, 1);
  assert.deepEqual(fused[0].parking.vehicleEntrance, [19.9388, 50.06]);
  assert.equal(fused[0].access.wheelchair, 'unknown'); assert.notEqual(fused[0].parking.transferVerified, true);
  assert.equal(fuseMunicipalParkings([osm, { ...osm, id: 'osm-way-2' }], [city]).length, 3);
  const presenceOnly = fuseMunicipalParkings([{ ...osm, parking: { ...osm.parking, capacity: '167', disabledSpaces: 'yes' } }], [city]);
  assert.equal(presenceOnly[0].dataConflicts.length, 0);
});
const metadata = { fields: ['OBJECTID', 'Nazwa', 'm_ogolem', 'm_elektryczne', 'm_niepełnosp', 'stojaki', 'monitoring', 'infolinia', 'doba_parkingowa'].map(name => ({ name })), geometryType: 'esriGeometryPoint', editingInfo: { dataLastEditDate: Date.parse(sourceUpdatedAt) } };
test('city import is complete or retains last good data with explicit failure and staleness', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'parking-fusion-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'city.json'), now = () => Date.parse(fetchedAt);
  const fetchImpl = async url => new Response(JSON.stringify(url.includes('returnCountOnly') ? { count: 1 } : url.includes('/query?') ? { features: [feature], spatialReference: { wkid: 4326 } } : metadata));
  const result = await syncMunicipalParkings({ path, now, fetchImpl });
  assert.equal(result.sync.status, 'success'); assert.equal(result.places[0].parking.mobilityExit, null);
  const failed = await syncMunicipalParkings({ path, now, fetchImpl: async () => new Response('{}', { status: 503 }) });
  assert.equal(failed.sync.status, 'error'); assert.deepEqual(failed.places, result.places);
  const layer = createMunicipalParkingsLayer(path, { now: () => Date.parse(fetchedAt) + 72 * 3600000 });
  assert.equal(layer.current().status.stale, true); assert.equal(layer.current().places[0].provenance.syncStatus, 'error');
  const incomplete = await syncMunicipalParkings({ path, now, fetchImpl: async url => url.includes('returnCountOnly') ? new Response('{"count":2}') : fetchImpl(url) });
  assert.equal(incomplete.sync.status, 'error'); assert.equal(incomplete.places.length, 1);
});
