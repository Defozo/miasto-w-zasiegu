import { distance } from './routing.mjs';

const normalize = value => (value ?? '').toLocaleLowerCase('pl').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replaceAll('ł', 'l').replace(/[^a-z0-9]+/g, ' ').trim();
const parkingName = value => normalize(value).replace(/\b(parkingi?|park and ride|parkuj i jedz|p r)\b/g, '').replace(/\s+/g, ' ').trim();
const inside = (point, ring) => {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
};
const sources = (...places) => places.flatMap(p => [p.provenance, ...(p.relatedSources ?? [])]).filter(Boolean);

// Match a numbered platform, never a stop-name group or just nearby points.
// Ambiguous pairs stay separate. Changes to either source re-run the match.
export function fuseMunicipalStops(osmPlaces, municipalPlaces) {
  const byName = new Map();
  for (const place of osmPlaces) {
    if (place.placeType !== 'transit_stop' && !(place.category === 'transport' && !place.parking)) continue;
    const name = normalize(place.name);
    if (!/\s\d{1,2}$/.test(name)) continue;
    const group = byName.get(name) ?? []; group.push(place); byName.set(name, group);
  }
  const matches = new Map(), used = new Map();
  for (const city of municipalPlaces) {
    const candidates = (byName.get(normalize(city.name)) ?? []).filter(osm => distance(osm.coordinates, city.coordinates) <= 35);
    if (candidates.length !== 1) continue;
    matches.set(city.id, candidates[0]);
    used.set(candidates[0].id, (used.get(candidates[0].id) ?? 0) + 1);
  }
  const removed = new Set();
  const cities = municipalPlaces.map(city => {
    const osm = matches.get(city.id);
    if (!osm || used.get(osm.id) !== 1) return city;
    removed.add(osm.id);
    return { ...city, access: { ...osm.access }, description: `${city.description} Opis dostępności pochodzi z OpenStreetMap.`, sourceIds: [city.id, osm.id], relatedSources: sources(osm),
      fusion: { method: 'same-numbered-platform-within-35m', distanceM: Math.round(distance(osm.coordinates, city.coordinates)) } };
  });
  return [...osmPlaces.filter(p => !removed.has(p.id)), ...cities];
}

export function fuseMunicipalParkings(osmPlaces, municipalPlaces) {
  const assignments = new Map(), used = new Map();
  for (const city of municipalPlaces) {
    const candidates = osmPlaces.filter(osm => !osm.parking?.parentParkingId && osm.parking?.kind !== 'parking_space' &&
      ((osm.parking?.area && inside(city.coordinates, osm.parking.area)) ||
        (parkingName(city.name) && parkingName(city.name) === parkingName(osm.name) && distance(city.coordinates, osm.coordinates) <= 120)));
    if (candidates.length !== 1) continue;
    assignments.set(city.id, candidates[0]); used.set(candidates[0].id, (used.get(candidates[0].id) ?? 0) + 1);
  }
  const replacements = new Map(), standalone = [];
  for (const city of municipalPlaces) {
    const osm = assignments.get(city.id);
    if (!osm || used.get(osm.id) !== 1) { standalone.push(city); continue; }
    const dataConflicts = [];
    for (const field of ['capacity', 'disabledSpaces']) {
      const a = osm.parking?.[field], b = city.parking[field];
      // capacity:disabled=yes describes presence, not a count of one space.
      const conflicting = a != null && b != null && ((/^\d+$/.test(String(a)) && Number(a) !== Number(b)) ||
        (a === 'yes' && Number(b) === 0) || (a === 'no' && Number(b) > 0));
      if (conflicting) dataConflicts.push({ field, osm: String(a), municipal: String(b) });
    }
    replacements.set(osm.id, { ...osm, name: city.name, sourceIds: [osm.id, city.id], relatedSources: sources(city),
      municipalParkingFacts: city.municipalParkingFacts, municipalParkingSource: city.provenance, dataConflicts,
      fusion: { method: osm.parking?.area && inside(city.coordinates, osm.parking.area) ? 'city-point-in-osm-parking-area' : 'same-name-within-120m' },
      parking: { ...osm.parking, capacity: osm.parking?.capacity ?? city.parking.capacity, disabledSpaces: osm.parking?.disabledSpaces ?? city.parking.disabledSpaces } });
  }
  return [...osmPlaces.map(p => replacements.get(p.id) ?? p), ...standalone];
}
