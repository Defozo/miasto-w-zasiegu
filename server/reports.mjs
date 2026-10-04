import { randomUUID } from 'node:crypto';
import { ApiError, coordinates } from './routing.mjs';
import { geometryPoints, lineLength, segmentIntersection, bounds, boundsOverlap, lineTouchesGeometry, nearestOnLine, segmentBox, metricDistance } from '../shared/geo.mjs';

export const REPORT_KINDS = new Set(['obstacle', 'kerb', 'surface', 'width', 'lift', 'steps', 'ramp', 'entrance', 'rest_place', 'toilet']);
const LABELS = { obstacle: 'Zablokowane przejście', kerb: 'Krawężnik lub próg', surface: 'Nawierzchnia', width: 'Szerokość przejścia', lift: 'Winda', steps: 'Schody', ramp: 'Podjazd', entrance: 'Wejście', rest_place: 'Miejsce odpoczynku', toilet: 'Toaleta' };
const fail = message => { throw new ApiError(400, 'INVALID_REPORT', message); };
function numeric(v, max, label) { if (v === undefined || v === null || v === '') return null; if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max) fail(`${label}: podaj liczbę od 0 do ${max}.`); return v; }
export function parseReport(data, now = Date.now()) {
  if (!data || !REPORT_KINDS.has(data.kind) || typeof data.description !== 'string' || data.description.trim().length < 3 || data.description.length > 800) fail('Wybierz rodzaj i opisz obserwację (3–800 znaków).');
  const geometry = data.geometry ?? { type: 'Point', coordinates: data.coordinates };
  if (!geometry || !['Point', 'LineString', 'Polygon'].includes(geometry.type) || !Array.isArray(geometry.coordinates)) fail('Wskaż punkt, odcinek albo obszar.');
  if (geometry.type === 'Polygon' && (geometry.coordinates.length !== 1 || !Array.isArray(geometry.coordinates[0]))) fail('Obszar musi mieć jeden zamknięty obrys.');
  const points = geometryPoints(geometry);
  if (points.length < (geometry.type === 'Polygon' ? 4 : geometry.type === 'LineString' ? 2 : 1) || points.length > 60) fail('Zaznaczenie wymaga od 1 do 60 punktów.');
  for (const p of points) coordinates(p);
  if (geometry.type !== 'Point' && lineLength(points) > 2000) fail('Zaznacz krótszy odcinek lub mniejszy obszar (do 2 km obrysu).');
  if (geometry.type === 'LineString' && lineLength(points) < 1) fail('Odcinek musi mieć co najmniej metr długości.');
  if (geometry.type === 'Polygon') {
    if (metricDistance(points[0], points.at(-1)) > .01) fail('Zamknij obrys obszaru.');
    const box = bounds(geometry); if (metricDistance([box[0], box[1]], [box[2], box[3]]) < 1) fail('Obszar jest zbyt mały.');
    const scale = 111320 * 111320 * Math.cos(50.06 * Math.PI / 180);
    const area = Math.abs(points.slice(1).reduce((sum, p, i) => sum + (points[i][0] - points[0][0]) * (p[1] - points[0][1]) - (p[0] - points[0][0]) * (points[i][1] - points[0][1]), 0)) * scale / 2;
    if (area < .5) fail('Obrys musi wyznaczać obszar, a nie linię.');
    for (let i = 1; i < points.length; i++) for (let j = i + 2; j < points.length; j++)
      if (!(i === 1 && j === points.length - 1) && segmentIntersection(points[i - 1], points[i], points[j - 1], points[j])) fail('Obrys nie może przecinać sam siebie.');
  }
  const duration = data.duration ?? (['kerb', 'width', 'surface', 'steps', 'ramp', 'entrance', 'rest_place', 'toilet'].includes(data.kind) ? 'permanent' : 'temporary');
  if (!['permanent', 'temporary', 'unknown'].includes(duration)) fail('Wybierz trwałość obserwacji.');
  const observedAt = data.observedAt ? Date.parse(data.observedAt) : now;
  if (!Number.isFinite(observedAt) || observedAt > now + 300000 || observedAt < now - 2 * 365 * 86400000) fail('Podaj prawidłową datę obserwacji z ostatnich dwóch lat.');
  let validUntil = duration === 'temporary' ? new Date(observedAt + (data.kind === 'lift' ? 4 : 24) * 3600000).toISOString() : null;
  if (duration === 'temporary' && data.validUntil) {
    const end = Date.parse(data.validUntil);
    if (!Number.isFinite(end) || end <= observedAt || end > observedAt + 30 * 86400000) fail('Termin utrudnienia musi przypadać w ciągu 30 dni od obserwacji.');
    validUntil = new Date(end).toISOString();
  }
  const measurement = data.measurement ?? (data.widthCm != null ? 'measured' : 'unknown');
  if (!['measured', 'estimated', 'unknown'].includes(measurement)) fail('Wybierz sposób określenia wymiarów.');
  const locationAccuracy = data.locationAccuracy ?? 'approximate';
  if (!['precise', 'approximate'].includes(locationAccuracy)) fail('Określ dokładność wskazania miejsca.');
  const kerbType = data.kerbType ?? 'unknown';
  if (!['unknown', 'raised', 'lowered', 'flush', 'no'].includes(kerbType)) fail('Wybierz rodzaj krawężnika.');
  const effect = data.effect ?? (['ramp', 'entrance', 'rest_place', 'toilet'].includes(data.kind) ? 'facility' : 'barrier');
  if (!['barrier', 'facility', 'information'].includes(effect)) fail('Wybierz znaczenie obserwacji.');
  const featureId = data.featureId ?? null;
  if (featureId !== null && (typeof featureId !== 'string' || !/^osm-(node|way)-\d+$/.test(featureId))) fail('Wybierz element z mapy.');
  const inputMethod = data.inputMethod ?? 'manual', locationSource = data.locationSource ?? 'manual';
  if (!['manual', 'photo-ai'].includes(inputMethod) || !['manual', 'photo-gps', 'browser'].includes(locationSource)) fail('Niepoprawne źródło obserwacji lub położenia.');
  if (inputMethod === 'photo-ai' && data.photoReviewed !== true) fail('Sprawdź opis, położenie i datę obserwacji przed publikacją.');
  return { kind: data.kind, description: data.description.trim(), coordinates: points[0], geometry,
    widthCm: numeric(data.widthCm, 1000, 'Szerokość'), heightCm: numeric(data.heightCm, 100, 'Wysokość'), inclinePercent: numeric(data.inclinePercent, 40, 'Nachylenie'),
    schemaVersion: 2, duration, observedAt: new Date(observedAt).toISOString(), validUntil, measurement, locationAccuracy, kerbType, effect, featureId,
    inputMethod, locationSource, photoReviewed: inputMethod === 'photo-ai',
    side: typeof data.side === 'string' ? data.side.trim().slice(0, 140) : '', surface: typeof data.surface === 'string' ? data.surface.trim().slice(0, 80) : null };
}
export function ensureReports(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS report_details(report_id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS report_events(id TEXT PRIMARY KEY, report_id TEXT NOT NULL, user_id TEXT, action TEXT NOT NULL, description TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS report_events_report ON report_events(report_id,created_at);`);
}
export function enrichReport(row, details, events = [], now = Date.now()) {
  const data = details ? JSON.parse(details.data) : { schemaVersion: 1, duration: ['kerb', 'surface', 'width'].includes(row.kind) ? 'permanent' : 'temporary',
    observedAt: row.created_at, validUntil: ['kerb', 'surface', 'width'].includes(row.kind) ? null : new Date(Date.parse(row.created_at) + 86400000).toISOString(),
    geometry: { type: 'Point', coordinates: [row.lon, row.lat] }, locationAccuracy: 'approximate', measurement: row.width_cm == null ? 'unknown' : 'measured', effect: 'barrier', featureId: null };
  const revisionEvents = events.filter(e => e.created_at >= (data.revisedAt || row.created_at));
  const latest = [revisionEvents.filter(e => e.action === 'confirm').at(-1)?.created_at, data.observedAt].filter(Boolean).sort().at(-1);
  const disputed = revisionEvents.some(e => e.action === 'dispute');
  const validUntil = data.duration === 'temporary' ? new Date(Date.parse(latest) + Math.max(0, Date.parse(data.validUntil) - Date.parse(data.observedAt))).toISOString() : null;
  const ageHours = Math.max(0, (now - Date.parse(latest)) / 3600000);
  return { id: row.id, kind: row.kind, coordinates: [row.lon, row.lat], description: row.description, widthCm: row.width_cm,
    ...data, validUntil, title: LABELS[row.kind], userId: row.user_id ?? null, status: row.status, createdAt: row.created_at, resolvedAt: row.resolved_at,
    ageHours: Math.round(ageHours * 10) / 10, stale: data.duration === 'temporary' ? now >= Date.parse(validUntil) : ageHours > 24 * 90,
    lastConfirmedAt: latest, disputed, confirmations: new Set(revisionEvents.filter(e => e.action === 'confirm' && e.user_id !== row.user_id).map(e => e.user_id)).size,
    history: events.map(({ action, description, created_at }) => ({ action, description, observedAt: created_at })),
    sourceLabel: data.inputMethod === 'photo-ai' ? 'Zdjęcie + propozycja AI sprawdzona przez autora · bez niezależnego audytu' : 'Obserwacja społeczności · bez niezależnego audytu', verification: disputed ? 'conflict' : 'unverified' };
}
export function addReportEvent(db, id, userId, action, description = '') {
  if (!['confirm', 'dispute', 'edit'].includes(action)) fail('Wybierz potwierdzenie albo zgłoś zmianę.');
  if (description.length > 800 || action === 'dispute' && description.trim().length < 5) fail('Opisz zmianę (5–800 znaków).');
  const previous = db.prepare('SELECT created_at FROM report_events WHERE report_id=? AND user_id=? AND action=? ORDER BY created_at DESC LIMIT 1').get(id, userId, action);
  if (action !== 'edit' && previous && Date.now() - Date.parse(previous.created_at) < 3600000) throw new ApiError(429, 'CONFIRMATION_LIMIT', 'Tę obserwację można potwierdzić raz na godzinę.');
  db.prepare('INSERT INTO report_events VALUES(?,?,?,?,?,?)').run(randomUUID(), id, userId, action, description.trim(), new Date().toISOString());
}
export function reportBlocks(r, profile) {
  if (r.status !== 'active' || r.effect === 'facility' || r.effect === 'information' || r.disputed || r.duration === 'temporary' && r.stale) return false;
  if (r.kind === 'kerb') return r.measurement === 'measured' && Number.isFinite(r.heightCm) && r.heightCm > profile.maxKerbCm;
  if (r.kind === 'width') return r.measurement === 'measured' && Number.isFinite(r.widthCm) && Number.isFinite(profile.widthCm) && r.widthCm < profile.widthCm;
  if (r.kind === 'surface') return profile.avoidUnpaved && ['gravel', 'ground', 'sand', 'unpaved', 'grass', 'dirt'].includes(r.surface);
  return ['obstacle', 'steps', 'lift'].includes(r.kind);
}
export function avoidanceForReport(r, layer, route = null) {
  const g = r.geometry || { type: 'Point', coordinates: r.coordinates };
  const f = r.featureId ? layer?.get(r.featureId) : null;
  const wayIds = route ? new Set((route.waySegments || []).map(v => String(v[2]))) : null;
  if (f && wayIds?.size && !(r.kind === 'kerb' && f.geometry.type === 'LineString')) {
    const ids = f.properties.osmType === 'way' ? [f.properties.osmId] : f.properties.crossingWayIds?.length ? f.properties.crossingWayIds : f.properties.wayIds || [];
    if (ids.length && !ids.some(id => wayIds.has(id))) return [];
  }
  if (g.type === 'Polygon') return route && !lineTouchesGeometry(route.coordinates, g, 0) ? [] : [g.coordinates];
  if (g.type === 'LineString') {
    if (r.locationAccuracy !== 'precise' && !f) return [];
    if (r.kind === 'kerb' && route && !route.coordinates.slice(1).some((p, i) => g.coordinates.slice(1).some((q, j) => segmentIntersection(route.coordinates[i], p, g.coordinates[j], q)))) return [];
    if (route && !lineTouchesGeometry(route.coordinates, g, 1)) return [];
    return g.coordinates.slice(1).map((p, i) => segmentBox(g.coordinates[i], p)).filter(Boolean);
  }
  // A curb observation affects crossing edges only, never a square around the sidewalk.
  if (r.kind === 'kerb' && f?.properties.crossingWayIds?.length) {
    return f.properties.crossingWayIds.flatMap(id => {
      if (wayIds?.size && !wayIds.has(id)) return [];
      const crossing = layer.get(`osm-way-${id}`)?.geometry.coordinates;
      if (!crossing || crossing.length < 2) return [];
      const match = nearestOnLine(r.coordinates, crossing), a = crossing[match.index], b = crossing[match.index + 1];
      const length = metricDistance(a, b), fraction = Math.min(.4, 1.5 / Math.max(1, length));
      const start = [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
      const end = [b[0] - (b[0] - a[0]) * fraction, b[1] - (b[1] - a[1]) * fraction];
      const polygon = segmentBox(start, end, .45); return polygon ? [polygon] : [];
    });
  }
  // Unanchored point observations remain visible but cannot identify which side is blocked.
  if (!route || r.locationAccuracy !== 'precise' || r.kind === 'kerb') return [];
  const match = nearestOnLine(r.coordinates, route.coordinates);
  if (match.distance > 1.5) return [];
  const a = route.coordinates[match.index], b = route.coordinates[match.index + 1], length = metricDistance(a, b);
  if (length < 2) return [];
  const t = Math.max(.1, Math.min(.9, match.t)), delta = Math.min(.1, .5 / length);
  const one = [a[0] + (b[0] - a[0]) * (t - delta), a[1] + (b[1] - a[1]) * (t - delta)];
  const two = [a[0] + (b[0] - a[0]) * (t + delta), a[1] + (b[1] - a[1]) * (t + delta)];
  return [segmentBox(one, two)].filter(Boolean);
}
