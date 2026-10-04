import { readFileSync } from 'node:fs';
import { ApiError, distance } from './routing.mjs';

const normalize = text => text.toLocaleLowerCase('pl').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replaceAll('ł', 'l')
  .replace(/\b(ulica|ul\.|aleja|al\.)\s*/g, '').replace(/[^a-z0-9/]+/g, ' ').trim();
const cache = new Map();
const isMunicipalStop = place => place.id?.startsWith('ztp-stop-') || place.provenance?.datasetId === 'ztp-kmk-stops';

function placeRows(places, includeAddress = () => false) {
  return places.filter(p => !(p.placeType === 'bench' && p.name === 'Ławka')).map(p => ({
    id: p.id, label: p.name, coordinates: p.coordinates, kind: 'place', precision: 'approximate',
    sourceLabel: p.sourceLabel, sourceUrl: p.sourceUrl,
    ...(p.coordinateKind ? { coordinateKind: p.coordinateKind } : {}),
    ...(isMunicipalStop(p) ? { disambiguationHint: 'Przystanek ze źródła miejskiego ZTP. Położenie przystanku nie potwierdza dostępności peronu ani dojścia.' } : {}),
    normalized: normalize(p.name),
    searchable: normalize(`${p.name} ${includeAddress(p) ? p.address ?? '' : ''}`),
  }));
}

function sourceFamily(row) {
  if (/^osm-/.test(row.id) || /^https:\/\/(?:www\.)?openstreetmap\.org\/(?:node|way|relation)\//.test(row.sourceUrl ?? '')) return 'osm';
  if (row.id?.startsWith('ztp-stop-')) return 'ztp-stops';
  return row.sourceLabel ? normalize(row.sourceLabel) : row.sourceUrl ?? 'unknown';
}

export function registerLocations(app, { store, passports }, path) {
  let imported = cache.get(path);
  if (!imported) {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    imported = { source: data.source, locations: data.locations.map(row => ({ ...row, normalized: normalize(row.label) })) };
    cache.set(path, imported);
  }
  const importedPlaces = [...new Map([...(store.osmPlaces?.() ?? []), ...store.places()].map(p => [p.id, p])).values()].filter(p => !isMunicipalStop(p));
  // A published projection deliberately no longer claims OSM provenance. Keep
  // the original source identity only for joining the stable address index.
  const sourcePlaces = importedPlaces.flatMap(place => {
    if (!place.passportRevision) return [place];
    const original = passports?.getPassport(place.id)?.sourcePlace;
    // A user-supplied website is not an imported record identity. In
    // particular, new community entries must never rename an OSM address.
    return original ? [original] : [];
  });
  const sourceUrlByPlaceId = new Map(sourcePlaces.filter(p => p.sourceUrl).map(p => [p.id, p.sourceUrl]));
  const namesBySource = new Map(sourcePlaces.filter(p => p.sourceUrl && p.name).map(p => [p.sourceUrl, p.name]));
  const addresses = imported.locations.map(row => {
    const placeName = row.kind === 'address' ? namesBySource.get(row.sourceUrl) : undefined;
    return { ...row, ...(placeName ? { placeName } : {}), searchable: `${row.normalized}${placeName ? ` ${normalize(placeName)}` : ''}` };
  });
  const addressesBySource = new Map();
  for (const row of addresses) {
    if (row.kind !== 'address' || !row.sourceUrl) continue;
    const group = addressesBySource.get(row.sourceUrl) ?? [];
    group.push(row); addressesBySource.set(row.sourceUrl, group);
  }
  const cachedRows = [...addresses, ...placeRows(importedPlaces)];
  app.get('/api/locations', (req, res) => {
    const q = req.query.q ?? '', limit = req.query.limit === undefined ? 8 : Number(req.query.limit);
    if (typeof q !== 'string' || q.length > 150 || !Number.isInteger(limit) || limit < 1 || limit > 20)
      throw new ApiError(400, 'INVALID_QUERY', 'Zapytanie do 150 znaków, limit od 1 do 20.');
    const query = normalize(q);
    if (query.length < 2) return res.json({ locations: [], total: 0 });
    // Refresh the small published/community layer without rebuilding the large
    // address index. A newly published place is searchable immediately.
    const published = store.passportPlaces?.() ?? [];
    const publishedIds = new Set(published.map(place => place.id));
    const addressOverrides = new Map();
    for (const place of published) {
      const sourceUrl = sourceUrlByPlaceId.get(place.id);
      for (const row of addressesBySource.get(sourceUrl) ?? []) {
        addressOverrides.set(row.id, { ...row, placeName: place.name,
          searchable: `${row.normalized} ${normalize(place.name)}` });
      }
    }
    const cityPlaces = store.municipalPlaces();
    const mergedSourceIds = new Set(cityPlaces.flatMap(place => (place.sourceIds ?? []).filter(id => id !== place.id)));
    const rows = [...cachedRows.filter(row => !publishedIds.has(row.id) && !mergedSourceIds.has(row.id)).map(row => addressOverrides.get(row.id) ?? row),
      ...placeRows(cityPlaces.filter(place => !publishedIds.has(place.id))),
      ...placeRows(published, place => {
        // Keep source POIs from duplicating their existing address rows. A new
        // community address or an explicitly changed address has no such row.
        const sourceUrl = sourceUrlByPlaceId.get(place.id);
        const existing = addressesBySource.get(sourceUrl) ?? [];
        return !existing.some(row => row.normalized === normalize(place.address ?? ''));
      })];
    const tokens = query.split(' '), containsHouse = tokens.some(t => /^\d/.test(t));
    const rank = row => row.normalized === query ? 0 : row.normalized.startsWith(`${query} `) ? 1 : row.normalized.startsWith(query) ? 2 : 3;
    const matched = rows.filter(row => tokens.every(token => /^\d/.test(token)
      // Address rows must match the house number, not a digit in the attached
      // business name ("Galeria 1" at Testowa 120 must not match Testowa 1).
      ? (row.kind === 'address' ? row.normalized : row.searchable ?? row.normalized).split(' ').some(part => part === token)
      : (row.searchable ?? row.normalized).includes(token)));
    matched.sort((a, b) => rank(a) - rank(b) || (containsHouse ? (a.kind === 'address' ? 0 : 1) - (b.kind === 'address' ? 0 : 1) : 0)
      || (a.normalized === b.normalized ? Number(Boolean(b.placeName)) - Number(Boolean(a.placeName)) : 0)
      || distance(a.coordinates, [19.938, 50.061]) - distance(b.coordinates, [19.938, 50.061]));
    const distinct = [];
    // An address can belong to several distinct objects. Proximity alone is not proof of one building.
    const seen = new Map();
    for (const row of matched) {
      const key = `${row.kind}:${row.normalized}`;
      const previous = seen.get(key) ?? [];
      const duplicate = previous.some(other => {
        const family = sourceFamily(row);
        if (family !== sourceFamily(other)) return false;
        if (row.id === other.id) return true;
        // A dataset URL or nearby point does not identify the same platform.
        // Keep external records distinct; only the existing OSM representations
        // have the proximity rules below.
        if (family !== 'osm') return false;
        if (row.kind === 'street') return true;
        if (row.sourceUrl && row.sourceUrl === other.sourceUrl) return true;
        const nearby = distance(other.coordinates, row.coordinates);
        if (row.kind !== 'address') return nearby < 60;
        const differentNames = row.placeName && other.placeName && normalize(row.placeName) !== normalize(other.placeName);
        return !differentNames && nearby < 3;
      });
      if (duplicate) continue;
      previous.push(row); seen.set(key, previous); distinct.push(row);
    }
    const locations = distinct.slice(0, limit).map(({ normalized, searchable, street, houseNumber, city, ...row }) => {
      if (row.kind !== 'address') return row;
      const siblings = seen.get(`address:${normalized}`);
      const sameName = siblings.filter(other => normalize(other.placeName ?? '') === normalize(row.placeName ?? ''))
        .sort((a, b) => a.id.localeCompare(b.id));
      const pointNumber = sameName.length > 1 ? ` ${sameName.findIndex(other => other.id === row.id) + 1}` : '';
      const suffix = row.placeName
        ? `${row.placeName}${sameName.length > 1 ? ` · punkt adresowy${pointNumber}` : ''}`
        : siblings.length > 1 ? `punkt adresowy${pointNumber}` : '';
      let disambiguationHint;
      if (siblings.length > 1 && (!row.placeName || sameName.length > 1)) {
        const others = siblings.filter(other => other.id !== row.id)
          .sort((a, b) => Number(Boolean(b.placeName)) - Number(Boolean(a.placeName))
            || distance(row.coordinates, a.coordinates) - distance(row.coordinates, b.coordinates));
        const reference = others[0], meters = distance(row.coordinates, reference.coordinates);
        const separation = meters < 1 ? 'w tym samym miejscu na mapie'
          : `około ${meters >= 1000 ? `${(meters / 1000).toLocaleString('pl-PL', { maximumFractionDigits: 1 })} km` : `${Math.round(meters)} m`} w linii prostej od ${reference.placeName ?? 'innego punktu'}`;
        disambiguationHint = `Inny punkt tego samego adresu, ${separation}. ${row.coordinateKind === 'representative-center' ? 'Przybliżone położenie obiektu. ' : ''}Wejście niezweryfikowane.`;
      } else if (row.coordinateKind === 'representative-center') {
        disambiguationHint = 'Przybliżone położenie obiektu. Wejście niezweryfikowane.';
      }
      return { ...row, addressLabel: row.label, label: `${row.label}${suffix ? ` · ${suffix}` : ''}`,
        ...(disambiguationHint ? { disambiguationHint } : {}) };
    });
    res.json({ locations, total: distinct.length,
      source: { ...imported.source, scope: 'address-base', placeSources: [...(store.source?.datasets ?? []), ...(store.municipalParkingSource?.() ? [store.municipalParkingSource()] : [])] } });
  });
}
