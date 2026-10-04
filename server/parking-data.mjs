import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const restricted = new Set(['no', 'private', 'permit', 'residents', 'staff', 'employees', 'delivery', 'agricultural', 'forestry', 'bus', 'taxi']);
export const restrictedParking = place => (place.accessRestriction ?? '').split(';').some(value => restricted.has(value.trim())) ||
  place.parking?.vehicleAccess === 'restricted' || /\bkiss\s*(?:&|and|\+|n)?\s*ride\b/i.test(place.name ?? '');

export function applyParkingAccess(places, data, path) {
  let overlay;
  try { overlay = JSON.parse(readFileSync(resolve(dirname(path), 'parking-access.json'), 'utf8')); }
  catch { return places; }
  // Never attach road nodes from a different map extract to current parking IDs.
  if (overlay.schemaVersion !== 1 || overlay.snapshotAt !== data.source?.snapshotDate || !overlay.records) return places;
  return places.map(place => {
    const record = overlay.records[place.id];
    if (!record) return place;
    return { ...place, parking: { ...place.parking, ...record, topologyImportedAt: overlay.importedAt,
      vehicleEntrance: record.vehicleEntrances?.[0]?.coordinates ?? null,
      mobilityExit: record.mobilityExits?.[0]?.coordinates ?? null, transferVerified: false } };
  });
}

export function distinctParkings(places) {
  const ids = new Set(places.map(place => place.id));
  return places.filter(place => !place.parking?.parentParkingId || !ids.has(place.parking.parentParkingId));
}
