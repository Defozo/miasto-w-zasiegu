import { readFileSync } from 'node:fs';
import { ApiError, parseRoute, calculateRoute, getJson, distance } from './routing.mjs';
import { applyParkingAccess, distinctParkings, restrictedParking } from './parking-data.mjs';

export function loadParkings(path) {
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    if (!Array.isArray(data.places)) return [];
    return applyParkingAccess(data.places.filter(p => p.placeType === 'parking').map(p => ({ ...p,
      provenance: { datasetId: 'osm-geofabrik-parking', publisher: 'Społeczność OpenStreetMap',
        datasetUrl: data.source.url, recordUrl: p.sourceUrl, recordUpdatedAt: p.osmUpdatedAt,
        importedAt: data.importedAt, snapshotAt: data.source.snapshotDate,
        verification: 'source-only', termsUrl: 'https://www.openstreetmap.org/copyright' } })), data, path);
  } catch { return []; }
}
export async function driveRoute(start, end, { driveBase, fetchImpl = fetch, budgetMs = 12000 }) {
  const response = await getJson(`${driveBase}/v2/directions/driving-car/geojson`, { fetchImpl, method: 'POST', timeout: Math.max(1, Math.min(12000, budgetMs)),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ coordinates: [start, end], instructions: true, language: 'pl', radiuses: [100, 100] }) });
  if (!response.ok) throw new ApiError([400, 404, 422].includes(response.status) ? 422 : 503, 'CAR_ROUTE_UNAVAILABLE', 'Nie udało się obliczyć odcinka samochodem.', { orsCode: response.body.error?.code });
  const feature = response.body.features?.[0], summary = feature?.properties?.summary;
  if (!feature?.geometry?.coordinates?.length || !Number.isFinite(summary?.distance) || !Number.isFinite(summary?.duration))
    throw new ApiError(502, 'CAR_ROUTE_UNAVAILABLE', 'Silnik nie zwrócił pełnej trasy samochodowej.');
  return { geometry: feature.geometry, distanceM: summary.distance, durationS: summary.duration,
    steps: (feature.properties.segments || []).flatMap(s => s.steps || []).map(s => ({ instruction: s.instruction, distanceM: s.distance, wayPoints: s.way_points })),
    warnings: ['Szacunek bez bieżących korków. Google Maps może wybrać inną drogę.'],
    source: { engine: 'openrouteservice', profile: 'driving-car', calculatedAt: new Date().toISOString() } };
}
export async function calculateJourney(body, parkings, reports, options) {
  const deadline = Date.now() + 28000;
  const input = parseRoute(body);
  if (body.mode !== 'car') throw new ApiError(400, 'INVALID_JOURNEY', 'Wybierz podróż z samochodem.');
  if (body.parkingId !== undefined && typeof body.parkingId !== 'string') throw new ApiError(400, 'INVALID_PARKING', 'Niepoprawny parking.');
  const selected = parkings.find(p => p.id === body.parkingId || p.sourceIds?.includes(body.parkingId));
  const selectedId = selected?.parking?.parentParkingId || selected?.id || body.parkingId;
  const nearby = distinctParkings(parkings).filter(p => (!selectedId || p.id === selectedId) && distance(p.coordinates, input.end) <= 1800);
  const eligible = nearby.filter(p => !restrictedParking(p) && p.access?.wheelchair !== 'no');
  const quality = p => Number(!p.parking?.vehicleEntrance) + Number(!p.parking?.mobilityExit);
  const candidates = eligible.sort((a, b) => quality(a) - quality(b) || distance(a.coordinates, input.end) - distance(b.coordinates, input.end)).slice(0, 64);
  if (!candidates.length) throw new ApiError(422, 'NO_PARKING', nearby.length
    ? 'Parkingi są na mapie, ale te w odległości do 1,8 km od celu mają oznaczone ograniczenia dostępu. Wybierz inny parking lub podróż bez auta.'
    : 'Nie znaleziono parkingów w danych mapy w odległości do 1,8 km od celu. Wybierz inny cel lub podróż bez auta.', { nearbyParkings: nearby.length });
  const alternatives = [], unavailable = [];
  // Try the next group when a nearby lot has no car access or no onward route.
  // Three concurrent candidates bound graph load; never relax the user's profile.
  for (let offset = 0; offset < candidates.length && alternatives.length < 3; offset += 3) {
  if (Date.now() >= deadline) break;
  await Promise.all(candidates.slice(offset, offset + 3).map(async parking => {
    const endpoints = (field, fallback) => {
      if (field === 'mobilityExits' && parking.parking?.mobilityAccess === 'restricted') return [];
      const known = parking.parking?.[field];
      return known?.length ? [...known].sort((a, b) => distance(a.coordinates, input.end) - distance(b.coordinates, input.end)).map(p => p.coordinates).slice(0, 6)
        : [parking.parking?.[fallback] || parking.coordinates];
    };
    const calculateLeg = async (leg, points, run) => {
      const failures = [];
      if (!points.length) failures.push({ leg, code: 'MISSING_PARKING_EXIT', orsCode: null });
      for (const point of points) {
        if (Date.now() >= deadline) break;
        try { return { route: await run(point), point }; }
        catch (error) {
          if (error.status >= 500 || !error.status) throw error;
          failures.push({ leg, code: error.code, orsCode: error.details?.orsCode ?? null });
        }
      }
      throw new ApiError(422, 'PARKING_LEG_UNAVAILABLE', 'Nie znaleziono połączenia z parkingiem.', { failures });
    };
    try {
      const legs = await Promise.allSettled([
        calculateLeg('drive', endpoints('vehicleEntrances', 'vehicleEntrance'), point => (options.drive || driveRoute)(input.start, point, { ...options, budgetMs: deadline - Date.now() })),
        calculateLeg('onward', endpoints('mobilityExits', 'mobilityExit'), point => (options.onward || calculateRoute)({ ...input, start: point }, reports, { ...options, budgetMs: deadline - Date.now() })),
      ]);
      const rejected = legs.filter(leg => leg.status === 'rejected').map(leg => leg.reason);
      const unavailableService = rejected.find(error => error.status >= 500 || !error.status);
      if (unavailableService) throw unavailableService;
      if (rejected.length) {
        const failures = rejected.flatMap(error => error.details?.failures ?? []);
        unavailable.push({ parkingId: parking.id, failures,
          reason: failures.some(f => f.leg === 'drive') ? 'Nie znaleziono dojazdu samochodem do wjazdu.' : 'Nie znaleziono dalszej trasy od wyjścia z parkingu.' });
        return;
      }
      const [{ value: driveLeg }, { value: onwardLeg }] = legs;
      const { route: drive, point: vehicleEntrance } = driveLeg, { route: onward, point: mobilityExit } = onwardLeg;
      const transferKnown = Boolean(parking.parking?.vehicleEntrance && parking.parking?.mobilityExit && parking.parking?.transferVerified);
      const mappedConnections = parking.parking?.vehicleEntrances?.length && parking.parking?.mobilityExits?.length;
      alternatives.push({ id: parking.id, parking, drive, onward,
        transfer: { vehicleEntrance, mobilityExit, alightingPoint: parking.parking?.alightingPoint || null,
          status: transferKnown ? 'source-described' : 'unknown',
          message: transferKnown ? 'Sprawdź warunki przesiadki na miejscu.' : mappedConnections
            ? 'Punkty wjazdu i wyjścia pochodzą z mapy. Brak potwierdzenia przejścia między nimi oraz miejsca na wysiadanie.'
            : 'Brak danych o przejeździe przez parking, miejscu wysiadania i wyjściu. Punkty mogą być orientacyjne.' },
        status: transferKnown ? 'calculated' : 'incomplete',
        warnings: ['Nie znamy zajętości miejsc parkingowych.', ...(body.needsRampSpace ? ['Brak potwierdzonego miejsca na rampę lub wysiadanie.'] : []),
          ...(parking.parking?.disabledSpaces === 'yes' || Number(parking.parking?.disabledSpaces) > 0 ? ['Oznaczenie miejsc specjalnych nie potwierdza uprawnień do korzystania.'] : []),
          ...((parking.accessRestriction ?? '').includes('customers') ? ['Parking dla klientów. Sprawdź warunki korzystania.'] : [])],
      });
    } catch (error) {
      // An unavailable car engine affects every candidate; do not repeat slow failures.
      if (error.status >= 500) throw error;
      throw error;
    }
  }));
  }
  const diagnostics = { nearbyParkings: nearby.length, eligibleParkings: eligible.length, checkedParkings: unavailable.length + alternatives.length,
    searchIncomplete: unavailable.length + alternatives.length < eligible.length, failures: unavailable };
  if (!alternatives.length) {
    const driveFailures = unavailable.filter(p => p.failures.some(f => f.leg === 'drive')).length;
    const onwardFailures = unavailable.filter(p => p.failures.some(f => f.leg === 'onward')).length;
    const missingPoints = unavailable.filter(p => p.failures.some(f => f.orsCode === 2010)).length;
    const parts = [`Parkingi są na mapie. Sprawdzono: ${unavailable.length}.`];
    if (driveFailures) parts.push(`Brak wyznaczonego dojazdu autem: ${driveFailures}.`);
    if (onwardFailures) parts.push(`Brak dalszej trasy zgodnej z Twoimi ustawieniami: ${onwardFailures}.`);
    if (missingPoints) parts.push(`Dla ${missingPoints} parkingów silnik nie znalazł drogi przy jednym z punktów trasy.`);
    if (diagnostics.searchIncomplete) parts.push('Nie sprawdzono jeszcze wszystkich parkingów w okolicy.');
    throw new ApiError(422, 'NO_JOURNEY', parts.join(' '), { ...diagnostics,
      suggestion: driveFailures && !onwardFailures ? 'Wybierz inny parking albo opcję podróży bez auta. Zmiana potrzeb dotyczących poruszania się nie naprawi dojazdu samochodem.'
        : 'Spróbuj wskazać inne znane Ci wejście do celu lub wybrać inny parking. Brak trasy może wynikać z braków mapy albo ograniczeń przejścia.' });
  }
  alternatives.sort((a, b) => Number(a.transfer.status === 'unknown') - Number(b.transfer.status === 'unknown') || a.onward.distanceM - b.onward.distanceM);
  return { alternatives: alternatives.slice(0, 3), unavailable, diagnostics, calculatedAt: new Date().toISOString(), profile: body.profile,
    note: 'Odcinki są obliczone. Nieznane połączenia na parkingu wymagają sprawdzenia; nie są potwierdzeniem dostępności.' };
}
export function registerJourneys(app, { store }, options) {
  let running = 0;
  app.post('/api/journeys', async (req, res) => {
    if (running >= 2) throw new ApiError(429, 'JOURNEY_BUSY', 'Trwa obliczanie innych podróży. Spróbuj za chwilę.');
    running++;
    try { res.json(await calculateJourney(req.body, options.parkings(), store.reports(), options)); }
    finally { running--; }
  });
}
