import { readFileSync, existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { bounds, boundsOverlap, geometryPoints, lineTouchesGeometry, nearestOnLine, segmentIntersection, metricDistance } from '../shared/geo.mjs';
import { ApiError } from './routing.mjs';

export function lengthCm(raw) {
  if (typeof raw !== 'string') return null;
  const m = /^(\d+(?:[.,]\d+)?)\s*(m|cm|mm)?$/.exec(raw.trim());
  if (!m) return null;
  const n = Number(m[1].replace(',', '.')) * (m[2] === 'cm' ? 1 : m[2] === 'mm' ? 0.1 : 100);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}
const KERBS = { lowered: 'Obniżony krawężnik', flush: 'Krawężnik zlicowany z jezdnią', raised: 'Wysoki krawężnik', no: 'Brak krawężnika według źródła', yes: 'Krawężnik o nieznanym rodzaju', rolled: 'Krawężnik zaokrąglony' };
const SURFACES = { asphalt: 'asfalt', paving_stones: 'kostka brukowa', cobblestone: 'bruk', sett: 'bruk kamienny', concrete: 'beton', gravel: 'żwir', fine_gravel: 'drobny żwir', ground: 'grunt', unpaved: 'nieutwardzona', paved: 'utwardzona', compacted: 'ubita', sand: 'piasek', grass: 'trawa', dirt: 'ziemia' };
export function featureDetails(feature) {
  const p = feature.properties, t = p.tags || {}, kerbHeightCm = lengthCm(t['kerb:height'] ?? (p.kind === 'kerb' ? t.height : undefined));
  const widthCm = lengthCm(t['maxwidth:physical'] ?? t.width);
  const details = [], uncertainties = [];
  if (p.kind === 'kerb') {
    details.push(KERBS[t.kerb] || 'Krawężnik: rodzaj niepodany');
    if (kerbHeightCm !== null) details.push(`Wysokość podana w OSM: ${kerbHeightCm} cm`);
    else uncertainties.push('Brak liczbowej wysokości krawężnika.');
    if (t.kerb === 'lowered' && kerbHeightCm > 3 || t.kerb === 'flush' && kerbHeightCm > 0)
      uncertainties.push('Opis rodzaju i podana wysokość wymagają wyjaśnienia.');
  }
  if (p.kind === 'steps') details.push('Schody');
  if (p.kind === 'lift') details.push('Winda według mapy; brak informacji, czy teraz działa.');
  if (p.kind === 'entrance') details.push('Wejście do obiektu');
  if (t.surface) details.push(`Nawierzchnia: ${SURFACES[t.surface] || t.surface}`);
  if (t.smoothness) details.push(`Równość nawierzchni według OSM: ${t.smoothness}`);
  if (widthCm !== null) details.push(`Szerokość obiektu w OSM: ${widthCm} cm`);
  if (t.incline) details.push(`Nachylenie według OSM: ${t.incline}`);
  if (t.wheelchair) details.push(`Dostępność na wózku według OSM: ${{ yes: 'tak', no: 'nie', limited: 'ograniczona' }[t.wheelchair] || t.wheelchair}`);
  if (p.kind === 'path' && !t.surface) uncertainties.push('Brak danych o nawierzchni.');
  if (p.kind === 'path' && widthCm === null) uncertainties.push('Brak danych o szerokości.');
  if (p.kind === 'path' && t.highway && !['footway', 'path', 'pedestrian'].includes(t.highway)) uncertainties.push('Parametry drogi nie muszą opisywać chodnika.');
  return { title: p.kind === 'kerb' ? KERBS[t.kerb] || 'Krawężnik' : t.name || ({ path: 'Odcinek drogi', steps: 'Schody', lift: 'Winda', entrance: 'Wejście' }[p.kind]), details, uncertainties, kerbHeightCm, widthCm };
}
const cellsFor = box => {
  const keys = [];
  for (let x = Math.floor(box[0] / .005); x <= Math.floor(box[2] / .005); x++) for (let y = Math.floor(box[1] / .005); y <= Math.floor(box[3] / .005); y++) keys.push(`${x},${y}`);
  return keys;
};
const publicFeature = f => ({ ...f, properties: { ...f.properties, ...featureDetails(f) } });
export function loadAccessibility(path) {
  let data, indexed;
  const indexPath = typeof path === 'string' ? path.replace(/\.json$/, '.sqlite') : null;
  try {
    if (indexPath && existsSync(indexPath)) {
      indexed = new DatabaseSync(indexPath, { readOnly: true });
      data = { features: [], source: JSON.parse(indexed.prepare('SELECT data FROM metadata').get().data) };
    } else { data = JSON.parse(readFileSync(path, 'utf8')); if (data.schemaVersion !== 1 || !Array.isArray(data.features)) throw new Error(); }
  }
  catch { indexed?.close(); indexed = undefined; data = { features: [], source: null }; }
  const features = new Map(), index = new Map(), boxes = new Map();
  for (const f of data.features) {
    if (!f.id || !['Point', 'LineString'].includes(f.geometry?.type) || !f.properties?.tags) continue;
    const box = bounds(f.geometry);
    if (!box.every(Number.isFinite) || box[2] - box[0] > 1 || box[3] - box[1] > 1) continue;
    features.set(f.id, f); boxes.set(f.id, box);
    for (const key of cellsFor(box)) { if (!index.has(key)) index.set(key, []); index.get(key).push(f.id); }
  }
  const getIndexed = indexed?.prepare('SELECT data FROM features WHERE id=?');
  const findIndexed = indexed?.prepare('SELECT f.data,f.kind FROM bounds b JOIN features f ON f.rowid=b.rowid WHERE b.min_x<=? AND b.max_x>=? AND b.min_y<=? AND b.max_y>=?');
  const getFeature = id => indexed ? (() => { const row = getIndexed.get(id); return row ? JSON.parse(row.data) : undefined; })() : features.get(id);
  function query(box, kinds = null) {
    if (indexed) return findIndexed.all(box[2], box[0], box[3], box[1]).filter(f => !kinds || kinds.has(f.kind)).map(f => JSON.parse(f.data));
    const ids = new Set(cellsFor(box).flatMap(k => index.get(k) || []));
    return [...ids].map(id => features.get(id)).filter(f => boundsOverlap(box, boxes.get(f.id)) && (!kinds || kinds.has(f.properties.kind)));
  }
  return { source: data.source, size: indexed ? indexed.prepare('SELECT count(*) AS n FROM features').get().n : features.size, get: getFeature, query, close: () => indexed?.close(),
    publicFeature,
    routeEvidence(route, profile = {}, reports = []) {
      const line = route.geometry.coordinates, extra = route.source?.osmWaySegments || [];
      const wayIds = new Set(extra.map(v => String(v[2]))), events = [];
      const seen = new Set(); let knownSurfaceM = 0, unknownSurfaceM = 0;
      for (const [from, to, id] of extra) {
        const f = getFeature(`osm-way-${id}`), ps = line.slice(from, to + 1);
        let length = 0; for (let i = 1; i < ps.length; i++) length += metricDistance(ps[i - 1], ps[i]);
        if (f?.properties.tags.surface) knownSurfaceM += length; else unknownSurfaceM += length;
        if (!f || seen.has(f.id)) continue;
        seen.add(f.id);
        events.push({ id: f.id, kind: f.properties.kind, ...featureDetails(f), geometry: { type: 'LineString', coordinates: ps.length > 1 ? ps : geometryPoints(f.geometry) },
          distanceAlongM: Math.round(nearestOnLine(ps[0] || line[0], line).along), sourceUrl: f.properties.sourceUrl,
          sourceLabel: 'OpenStreetMap · bez audytu terenowego', updatedAt: f.properties.updatedAt, verification: 'source-only', applicability: 'route' });
      }
      for (const f of query(bounds(route.geometry, 4), new Set(['kerb', 'lift', 'entrance', 'steps']))) {
        if (seen.has(f.id)) continue;
        const p = f.properties;
        if (f.geometry.type === 'Point') {
          if (nearestOnLine(f.geometry.coordinates, line).distance > 3) continue;
          if (p.crossingWayIds?.length && !p.crossingWayIds.some(id => wayIds.has(id))) continue;
          if (p.wayIds?.length && wayIds.size && !p.wayIds.some(id => wayIds.has(id))) continue;
        } else {
          let crosses = false;
          for (let i = 1; i < line.length && !crosses; i++) for (let j = 1; j < f.geometry.coordinates.length; j++)
            if (segmentIntersection(line[i - 1], line[i], f.geometry.coordinates[j - 1], f.geometry.coordinates[j])) { crosses = true; break; }
          if (!crosses) continue;
        }
        const details = featureDetails(f), nearby = !wayIds.size || f.geometry.type === 'Point' && !(p.crossingWayIds?.some(id => wayIds.has(id)));
        if (details.kerbHeightCm > profile.maxKerbCm) details.uncertainties.push(`Podana wysokość przekracza Twoje ustawienie ${profile.maxKerbCm} cm. Sprawdź przebieg przed przejazdem.`);
        if (nearby) details.uncertainties.push('Punkt leży blisko trasy; nie potwierdzono, że trzeba go przekroczyć.');
        events.push({ id: f.id, kind: p.kind, ...details, geometry: f.geometry, distanceAlongM: Math.round(nearestOnLine(geometryPoints(f.geometry)[0], line).along),
          sourceUrl: p.sourceUrl, sourceLabel: 'OpenStreetMap · bez audytu terenowego', updatedAt: p.updatedAt, verification: 'source-only', applicability: nearby ? 'nearby' : 'route' });
      }
      for (const r of reports.filter(r => r.status === 'active')) {
        const geometry = r.geometry || { type: 'Point', coordinates: r.coordinates };
        if (!lineTouchesGeometry(line, geometry, 5)) continue;
        const details = [r.description], uncertainties = ['Brak niezależnego potwierdzenia. Obiekt leży na trasie lub do 5 m od niej; sprawdź właściwą stronę przejścia.'];
        if (r.heightCm != null) details.push(`Wysokość: ${r.heightCm} cm (${r.measurement === 'measured' ? 'pomiar' : 'wartość niepotwierdzona pomiarem'})`);
        if (r.widthCm != null) details.push(`Wolna szerokość: ${r.widthCm} cm (${r.measurement === 'measured' ? 'pomiar' : 'wartość niepotwierdzona pomiarem'})`);
        if (r.side) details.push(`Położenie: ${r.side}`);
        if (r.stale) uncertainties.push(r.duration === 'temporary' ? 'Termin utrudnienia minął. Nie blokuje automatycznie trasy.' : 'Stara obserwacja stałego elementu wymaga ponownego sprawdzenia.');
        if (r.disputed) uncertainties.push('Zgłoszono sprzeczne informacje. Do wyjaśnienia nie blokuje automatycznie trasy.');
        if (r.locationAccuracy !== 'precise') uncertainties.push('Położenie jest orientacyjne. Nie wiadomo, którego przejścia dotyczy.');
        if (r.kind === 'kerb' && (r.heightCm == null || r.measurement !== 'measured')) uncertainties.push('Brak pomiaru wysokości. Nie można porównać z Twoim limitem krawężnika.');
        events.push({ id: r.id, kind: 'report', title: r.title || 'Zgłoszenie społeczności', details, uncertainties,
          geometry, distanceAlongM: Math.round(nearestOnLine(r.coordinates, line).along), sourceLabel: r.sourceLabel, sourceUrl: null, updatedAt: r.lastConfirmedAt || r.observedAt || r.createdAt, verification: r.disputed ? 'conflict' : 'unverified', applicability: 'nearby' });
      }
      events.sort((a, b) => a.distanceAlongM - b.distanceAlongM || a.id.localeCompare(b.id));
      return { events: events.slice(0, 100), totalEvents: events.length, truncated: events.length > 100,
        coverage: { knownSurfaceM: Math.round(knownSurfaceM), unknownSurfaceM: Math.round(unknownSurfaceM), routeMatched: extra.length > 0 },
        source: data.source, note: 'Fakty ze źródeł, bez audytu przejezdności. Brak informacji nie oznacza braku bariery. Nie znamy liczby nieopisanych krawężników na tej trasie.' };
    } };
}
export function registerAccessibility(app, layer) {
  app.get('/api/accessibility', (req, res) => {
    const box = String(req.query.bbox || '19.92,50.05,19.96,50.075').split(',').map(Number);
    if (box.length !== 4 || !box.every(Number.isFinite) || box[0] < 19.7 || box[2] > 20.3 || box[1] < 49.85 || box[3] > 50.25 || box[0] >= box[2] || box[1] >= box[3] || box[2] - box[0] > .16 || box[3] - box[1] > .12)
      throw new ApiError(400, 'INVALID_AREA', 'Przybliż mapę, aby zobaczyć szczegółowe dane dostępności.');
    const kinds = new Set(String(req.query.kinds || 'kerb,steps,lift,entrance').split(','));
    const found = layer.query(box, kinds).sort((a, b) => Number(a.properties.kind === 'path') - Number(b.properties.kind === 'path'));
    res.json({ type: 'FeatureCollection', features: found.slice(0, 1500).map(layer.publicFeature), total: found.length, truncated: found.length > 1500, source: layer.source, available: layer.size > 0 });
  });
  app.get('/api/accessibility/:id', (req, res) => {
    const f = layer.get(req.params.id); if (!f) throw new ApiError(404, 'NOT_FOUND', 'Nie znaleziono tego elementu mapy.');
    res.json({ ...layer.publicFeature(f), source: layer.source });
  });
}
