import { randomUUID } from 'node:crypto';
import { avoidanceForReport, reportBlocks } from './reports.mjs';
import { lineTouchesGeometry } from '../shared/geo.mjs';

export class ApiError extends Error {
  constructor(status, code, message, details) { super(message); Object.assign(this, { status, code, details }); }
}

export function coordinates(value, label = 'coordinates') {
  const title = label === 'start' ? 'Punkt początkowy' : label === 'end' ? 'Cel' : label.startsWith('waypoints') ? 'Przystanek' : 'Położenie';
  if (!Array.isArray(value) || value.length !== 2 || value.some(v => typeof v !== 'number' || !Number.isFinite(v)))
    throw new ApiError(400, 'INVALID_INPUT', `${title}: wybierz poprawny punkt na mapie.`);
  if (value[0] < 19.75 || value[0] > 20.25 || value[1] < 49.9 || value[1] > 50.2)
    throw new ApiError(400, 'OUTSIDE_AREA', 'Ten prototyp obsługuje Kraków i najbliższą okolicę.');
  return value;
}

function number(value, min, max, name, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    throw new ApiError(400, 'INVALID_INPUT', `${{ widthCm: 'Szerokość wózka w cm', maxIncline: 'Maksymalne nachylenie w %', maxKerbCm: 'Wysokość krawężnika w cm' }[name] ?? name}: podaj liczbę od ${min} do ${max}.`);
  return value;
}

export function parseRoute(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'INVALID_INPUT', 'Brak danych trasy.');
  const start = coordinates(body.start, 'start'), end = coordinates(body.end, 'end');
  const waypoints = body.waypoints ?? [];
  if (!Array.isArray(waypoints) || waypoints.length > 5) throw new ApiError(400, 'INVALID_INPUT', 'Możesz dodać maksymalnie 5 przystanków pośrednich.');
  waypoints.forEach((point, index) => coordinates(point, `waypoints[${index}]`));
  const p = body.profile ?? {};
  if (typeof p !== 'object' || Array.isArray(p) || p === null) throw new ApiError(400, 'INVALID_INPUT', 'Niepoprawny profil.');
  for (const key of ['avoidUnpaved']) if (p[key] !== undefined && typeof p[key] !== 'boolean') throw new ApiError(400, 'INVALID_INPUT', 'Włącz lub wyłącz omijanie nieutwardzonej nawierzchni.');
  if (body.avoidReports !== undefined && typeof body.avoidReports !== 'boolean') throw new ApiError(400, 'INVALID_INPUT', 'Włącz lub wyłącz omijanie zgłoszonych przeszkód.');
  if (p.mobility !== undefined && !['manual', 'power', 'stroller', 'walking'].includes(p.mobility)) throw new ApiError(400, 'INVALID_INPUT', 'Niepoprawny sposób poruszania się.');
  const profile = { widthCm: number(p.widthCm, 30, 200, 'widthCm', null),
    maxIncline: number(p.maxIncline, 0, 15, 'maxIncline', 6), maxKerbCm: number(p.maxKerbCm, 0, 20, 'maxKerbCm', 6),
    avoidUnpaved: p.avoidUnpaved ?? false };
  if (!Number.isInteger(profile.maxIncline)) throw new ApiError(400, 'INVALID_INPUT', 'Nachylenie podaj w pełnych procentach, na przykład 6.');
  const points = [start, ...waypoints, end];
  if (points.slice(1).reduce((sum, point, index) => sum + distance(points[index], point), 0) > 20000) throw new ApiError(400, 'ROUTE_TOO_LONG', 'W prototypie suma odległości między przystankami nie może przekraczać 20 km.');
  return { start, end, waypoints, profile, mobility: p.mobility, avoidReports: body.avoidReports ?? true };
}

export function distance(a, b) {
  const radians = v => v * Math.PI / 180;
  const lat = radians(b[1] - a[1]), lon = radians(b[0] - a[0]);
  const h = Math.sin(lat / 2) ** 2 + Math.cos(radians(a[1])) * Math.cos(radians(b[1])) * Math.sin(lon / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function reportPolygon(point, halfSizeM = 6) {
  const dy = halfSizeM / 111320, dx = dy / Math.cos(point[1] * Math.PI / 180);
  const [x, y] = point;
  return [[[x-dx,y-dy],[x+dx,y-dy],[x+dx,y+dy],[x-dx,y+dy],[x-dx,y-dy]]];
}

const INITIAL_REPORT_BUFFER_M = 500;
const DETOUR_REPORT_BUFFER_M = 25;
const MAX_AVOIDANCE_REQUESTS = 3;
const MAX_REPORT_POLYGONS = 100;
const TOTAL_ROUTING_BUDGET_MS = 30000;

// A local tangent plane is sufficient for this Kraków-only, <=20 km planner.
// Test the entire segment, including its interior, in metres rather than degrees.
function nearPolyline(points, bufferM) {
  const referenceLat = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  const metrePerDegree = 6371008.8 * Math.PI / 180;
  const scaleX = metrePerDegree * Math.cos(referenceLat * Math.PI / 180);
  const origin = points[0];
  const project = point => [(point[0] - origin[0]) * scaleX, (point[1] - origin[1]) * metrePerDegree];
  const projected = points.map(project);
  // Small conservative allowance for the projection across the supported city area.
  const radius = bufferM * 1.005, radiusSquared = radius * radius;
  const segments = projected.slice(1).map((b, i) => {
    const a = projected[i], dx = b[0] - a[0], dy = b[1] - a[1];
    return { a, dx, dy, lengthSquared: dx * dx + dy * dy,
      left: Math.min(a[0], b[0]) - radius, right: Math.max(a[0], b[0]) + radius,
      bottom: Math.min(a[1], b[1]) - radius, top: Math.max(a[1], b[1]) + radius };
  });
  return point => {
    const [x, y] = project(point);
    return segments.some(segment => {
      if (x < segment.left || x > segment.right || y < segment.bottom || y > segment.top) return false;
      const t = segment.lengthSquared ? Math.max(0, Math.min(1,
        ((x - segment.a[0]) * segment.dx + (y - segment.a[1]) * segment.dy) / segment.lengthSquared)) : 0;
      return (x - segment.a[0] - t * segment.dx) ** 2 + (y - segment.a[1] - t * segment.dy) ** 2 <= radiusSquared;
    });
  };
}

export async function getJson(url, { fetchImpl = fetch, timeout = 15000, ...options } = {}) {
  let response;
  try { response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(timeout) }); }
  catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') throw new ApiError(504, 'ROUTING_TIMEOUT', 'Silnik tras nie odpowiedział na czas. Spróbuj ponownie.');
    throw new ApiError(503, 'ROUTING_UNAVAILABLE', 'Silnik tras jest obecnie niedostępny. Nie wyznaczono trasy zastępczej.');
  }
  const reader = response.body?.getReader();
  let bytes = 0, chunks = [];
  try {
    if (reader) while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 2 * 1024 * 1024) { await reader.cancel(); throw new ApiError(502, 'ROUTING_RESPONSE_TOO_LARGE', 'Odpowiedź silnika tras jest zbyt duża.'); }
      chunks.push(value);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    return { status: response.status, ok: response.ok, body: JSON.parse(text) };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error.name === 'TimeoutError' || error.name === 'AbortError') throw new ApiError(504, 'ROUTING_TIMEOUT', 'Odczyt trasy przekroczył limit czasu.');
    throw new ApiError(502, 'ROUTING_BAD_RESPONSE', 'Silnik tras zwrócił niepoprawną odpowiedź.');
  }
}

export async function calculateRoute(input, reports, { orsBase, fetchImpl, accessibility, now = () => performance.now(), budgetMs = TOTAL_ROUTING_BUDGET_MS }) {
  const deadline = now() + Math.min(TOTAL_ROUTING_BUDGET_MS, budgetMs);
  const remainingTime = () => {
    const remaining = Math.floor(deadline - now());
    if (remaining <= 0) throw new ApiError(504, 'ROUTING_TIMEOUT', 'Wyznaczanie trasy i sprawdzanie objazdów trwało zbyt długo. Spróbuj ponownie.');
    return remaining;
  };
  const { start, end, profile, avoidReports } = input;
  const points = [start, ...(input.waypoints ?? []), end];
  const candidates = avoidReports ? reports.filter(r => reportBlocks(r, profile)) : [];
  const applicable = [], polygons = [];
  const request = { coordinates: points, radiuses: points.map(() => 30), instructions: true, instructions_format: 'text', language: 'pl',
    units: 'm', geometry_simplify: false, suppress_warnings: false, extra_info: ['osmid', 'surface'],
    options: { avoid_features: ['steps'], profile_params: { surface_quality_known: false, allow_unsuitable: false,
      restrictions: { maximum_incline: profile.maxIncline,
        maximum_sloped_kerb: profile.maxKerbCm / 100, surface_type: profile.avoidUnpaved ? 'cobblestone' : 'any',
        ...(profile.avoidUnpaved ? { track_type: 'grade2' } : {}) } } } };
  // ORS 10.0.1: surface is an inclusive maximum (cobblestone=8 is the last paved
  // value), while track_type rejects values >= the selected grade. Thus grade2
  // excludes grades 2-5 and retains grade1. No unrequested smoothness restriction.
  if (profile.widthCm !== null) request.options.profile_params.restrictions.minimum_width = profile.widthCm / 100;
  let response, geometry, props, avoidanceRequests = 0;
  const included = new Set();
  for (let attempt = 1; attempt <= MAX_AVOIDANCE_REQUESTS; attempt++) {
    if (polygons.length > MAX_REPORT_POLYGONS)
      throw new ApiError(422, 'TOO_MANY_BARRIERS', 'W okolicy tego przejazdu jest zbyt wiele świeżych zgłoszeń. Spróbuj krótszej trasy.');
    if (polygons.length) request.options.avoid_polygons = { type: 'MultiPolygon', coordinates: polygons };
    response = await getJson(`${orsBase}/v2/directions/wheelchair/geojson`, { fetchImpl, method: 'POST', timeout: Math.min(15000, remainingTime()),
      headers: { 'Content-Type': 'application/json', Accept: 'application/geo+json' }, body: JSON.stringify(request) });
    avoidanceRequests++;
    remainingTime();
    if (!response.ok) {
      const orsCode = response.body?.error?.code;
      if ([2009, 2010].includes(orsCode)) throw new ApiError(422, 'NO_ROUTE', 'Nie znaleziono trasy spełniającej te warunki lub punktu dostępu w promieniu 30 m. Nie poluzowano ograniczeń.', { orsCode });
      throw new ApiError(response.status === 503 ? 503 : 502, 'ROUTING_ERROR', 'Silnik nie mógł obliczyć trasy.', { orsCode });
    }
    const feature = response.body?.features?.[0];
    geometry = feature?.geometry; props = feature?.properties;
    if (geometry?.type !== 'LineString' || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2 ||
        geometry.coordinates.some(point => !Array.isArray(point) || point.length < 2 ||
          !Number.isFinite(point[0]) || !Number.isFinite(point[1]) || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) ||
        !Number.isFinite(props?.summary?.distance) || props.summary.distance < 0 ||
        !Number.isFinite(props?.summary?.duration) || props.summary.duration < 0)
      throw new ApiError(502, 'ROUTING_BAD_RESPONSE', 'Nie udało się odczytać przebiegu trasy. Spróbuj ponownie.');
    if (polygons.some(coordinates => lineTouchesGeometry(geometry.coordinates, { type: 'Polygon', coordinates }, 0)))
      throw new ApiError(422, 'BARRIERS_UNRESOLVED', 'Silnik poprowadził trasę przez zgłoszoną barierę. Wybierz inny przebieg lub sprawdź zgłoszenie.');
    const routeShape = { coordinates: geometry.coordinates, waySegments: props.extras?.osmId?.values || [] };
    const additions = candidates.filter(report => !included.has(report.id)).map(report => ({ report, shapes: avoidanceForReport(report, accessibility, routeShape) })).filter(entry => entry.shapes.length);
    if (!additions.length) break;
    if (polygons.length + additions.reduce((n, a) => n + a.shapes.length, 0) > MAX_REPORT_POLYGONS)
      throw new ApiError(422, 'TOO_MANY_BARRIERS', 'W okolicy tego przejazdu jest zbyt wiele świeżych zgłoszeń. Spróbuj krótszej trasy.');
    if (attempt === MAX_AVOIDANCE_REQUESTS)
      throw new ApiError(422, 'BARRIERS_UNRESOLVED', 'Kolejne objazdy prowadzą w pobliże innych zgłoszonych przeszkód. Nie udało się wyznaczyć trasy omijającej ich okolice. Spróbuj innego przebiegu.');
    for (const { report, shapes } of additions) { applicable.push(report); included.add(report.id); polygons.push(...shapes); }
  }
  const steps = (props.segments ?? []).flatMap(segment => (segment.steps ?? []).map(step => ({ instruction: step.instruction,
    distanceM: step.distance, wayPoints: step.way_points })));
  const warnings = ['Przejezdność tej trasy nie została potwierdzona w terenie. Może zawierać odcinki, których szerokość jest nieznana.',
    'Początek, cel i przystanki mogą leżeć do 30 m od wskazanych punktów. Sprawdź właściwe wejście i stronę ulicy.'];
  if (profile.widthCm === null) warnings.push('Nie podano szerokości wózka, dlatego trasa nie omija automatycznie zgłoszonych zwężeń. Sprawdź szerokość przejść.');
  if (avoidReports && reports.some(r => r.status === 'active' && !r.stale && r.kind === 'width' && !Number.isFinite(r.widthCm)))
    warnings.push('Zgłoszenie szerokości bez wartości liczbowej wymaga sprawdzenia i nie blokuje automatycznie trasy.');
  if (profile.avoidUnpaved) warnings.push('Pominięto znane nieutwardzone nawierzchnie. Tam, gdzie brakuje danych, rodzaj nawierzchni nadal wymaga sprawdzenia.');
  warnings.push('Utwardzona droga również może być nierówna. Stan kostki, wyboje i koleiny wymagają sprawdzenia.');
  if (applicable.length) warnings.push(`Ominięto zgłoszone przejścia lub odcinki (${applicable.length}). Geometria pochodzi ze zgłoszeń społeczności i wymaga sprawdzenia w terenie.`);
  if (reports.some(r => r.status === 'active' && (r.disputed || r.duration === 'temporary' && r.stale))) warnings.push('Wygasłe utrudnienia tymczasowe i sprzeczne obserwacje pozostają widoczne, ale nie wyłączają automatycznie przejścia.');
  for (const warning of props.warnings ?? []) warnings.push(warning.code === 4 ? 'Dodatkowe informacje o ograniczeniach dostępu nie są kompletne.' : 'Silnik tras zgłosił dodatkowe ograniczenie. Sprawdź warunki na miejscu.');
  const indices = props.way_points ?? [0, geometry.coordinates.length - 1];
  const snappedCoordinates = indices.map(index => geometry.coordinates[index]);
  if (snappedCoordinates.length !== points.length || snappedCoordinates.some(point => !Array.isArray(point)))
    throw new ApiError(502, 'ROUTING_BAD_RESPONSE', 'Odpowiedź silnika nie zawiera wszystkich przystanków.');
  remainingTime();
  const result = { routeId: randomUUID(), geometry, distanceM: props.summary.distance, durationS: props.summary.duration, steps, warnings,
    source: { engine: 'openrouteservice', profile: 'wheelchair', version: response.body.metadata?.engine?.version ?? null,
      osmDate: response.body.metadata?.engine?.osm_date ?? null, attribution: '© OpenStreetMap contributors; openrouteservice / HeiGIT',
      computedAt: new Date().toISOString(), fieldVerified: false, snappedCoordinates,
      snapDistancesM: points.map((point, index) => distance(point, snappedCoordinates[index])),
      reportsAvoided: applicable.map(r => r.id), reportPolygonsCount: polygons.length,
      osmWaySegments: props.extras?.osmId?.values || [],
      reportSelection: { mode: 'geometry-and-crossing', requests: avoidanceRequests },
      profileApplied: profile, engineWarnings: props.warnings ?? [] } };
  if (accessibility) result.accessibility = accessibility.routeEvidence(result, profile, reports);
  if (result.accessibility?.events.some(e => e.kind === 'report')) warnings.push('Na trasie lub obok niej są obserwacje wymagające sprawdzenia. Ich szczegóły znajdują się poniżej.');
  return result;
}
