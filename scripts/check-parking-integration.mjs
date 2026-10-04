import { readFileSync, writeFileSync } from 'node:fs';
import { loadParkings, calculateJourney } from '../server/journeys.mjs';
import { fuseMunicipalStops, fuseMunicipalParkings } from '../server/place-fusion.mjs';
import { createMunicipalParkingsLayer } from '../server/municipal-parkings.mjs';
import { createMunicipalStopsLayer } from '../server/municipal-stops.mjs';
import { loadAccessibility } from '../server/accessibility-data.mjs';
import { distinctParkings } from '../server/parking-data.mjs';

const osm = JSON.parse(readFileSync('server/data/places.json', 'utf8')).places;
const parkings = loadParkings('server/data/parkings.json');
const city = createMunicipalParkingsLayer('server/data/municipal-parkings.json').current();
const stops = createMunicipalStopsLayer('server/data/municipal-stops.json').current();
const merged = fuseMunicipalParkings(parkings, city.places);
const mergedStops = fuseMunicipalStops(osm, stops.places);
const result = { checkedAt: new Date().toISOString(), parkings: { sourceRecords: parkings.length, distinct: distinctParkings(parkings).length,
  vehicleConnections: parkings.filter(p => p.parking?.vehicleEntrances?.length).length,
  pedestrianConnections: parkings.filter(p => p.parking?.mobilityExits?.length).length },
  municipalParkings: city.status, fusedParkings: merged.filter(p => p.municipalParkingFacts).map(p => ({ id: p.id, name: p.name, fusion: p.fusion ?? null,
    sourceIds: p.sourceIds, capacity: p.municipalParkingFacts.capacity, conflicts: p.dataConflicts,
    vehicleEntrance: p.parking.vehicleEntrance, mobilityExit: p.parking.mobilityExit })),
  fusedStops: mergedStops.filter(p => p.sourceIds).length,
  teatrSlowackiego: mergedStops.filter(p => /Teatr Słowackiego/.test(p.name)).map(p => ({ id: p.id, name: p.name, sourceIds: p.sourceIds })) };
console.log(JSON.stringify(result, null, 2));
if (!process.argv.includes('--data-only')) {
  const response = await fetch('http://127.0.0.1:3081/api/reports', { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Could not read current reports');
  const reports = (await response.json()).reports;
  const accessibility = loadAccessibility('server/data/accessibility.json');
  const profile = { mobility: 'manual', widthCm: 68, maxIncline: 6, maxKerbCm: 2, avoidUnpaved: false };
  const cases = [{ name: 'Długa 12 → Rynek Główny 1', start: [19.9384226, 50.0670497], end: [19.9374676, 50.0615455] }];
  const pr = merged.find(p => p.municipalParkingFacts && /Kurdwanów/i.test(p.name));
  const stop = mergedStops.find(p => /Kurdwanów P\+R 01/i.test(p.name));
  if (pr && stop) cases.push({ name: `Długa 12 → ${stop.name}, przez ${pr.name}`, start: cases[0].start, end: stop.coordinates, parkingId: pr.id });
  result.journeys = [];
  try {
    for (const sample of cases) {
      const input = { ...sample, profile, mode: 'car', waypoints: [], avoidReports: true }, started = Date.now();
      try {
        const journey = await calculateJourney(input, merged, reports, { orsBase: 'http://127.0.0.1:18082/ors', driveBase: 'http://127.0.0.1:18083/ors', accessibility });
        result.journeys.push({ input, elapsedMs: Date.now() - started, diagnostics: journey.diagnostics,
          alternatives: journey.alternatives.map(a => ({ id: a.id, name: a.parking.name, driveM: a.drive.distanceM, onwardM: a.onward.distanceM, transfer: a.transfer })) });
      } catch (error) { result.journeys.push({ input, elapsedMs: Date.now() - started, error: { code: error.code, message: error.message, details: error.details } }); }
    }
  } finally { accessibility.close?.(); }
  console.log(JSON.stringify(result.journeys, null, 2));
}
writeFileSync('artifacts/parking-integration-check.json', JSON.stringify(result, null, 2));
