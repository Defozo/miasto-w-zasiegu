import express from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { openStore } from './store.mjs';
import { registerGameRoutes } from './game.mjs';
import { registerExplorerRoutes } from './explorer.mjs';
import { registerWheelchairSearch } from './wheelchair-search.mjs';
import { registerFavorites } from './favorites.mjs';
import { registerObservationRoutes } from './observations.mjs';
import { wheelchairPresentation } from './wheelchair-labels.mjs';
import { ApiError, calculateRoute, coordinates, distance, getJson, parseRoute } from './routing.mjs';
import { createAuth, getUser } from './auth.mjs';
import { createTrips } from './trips.mjs';
import { registerLocations } from './locations.mjs';
import { registerPlacePassportRoutes } from './place-passports.mjs';
import { registerSiteVerificationRoutes } from './site-verification.mjs';
import { createStopSuggestions } from './stops.mjs';
import { matchesPlaceFilters, parsePlaceFilters } from '../shared/place-filters.mjs';
import { registerMobilityPresets } from './mobility-presets.mjs';
import { registerEquipmentResearch } from './equipment-research.mjs';
import { loadParkings, registerJourneys } from './journeys.mjs';
import { createMunicipalParkingsLayer } from './municipal-parkings.mjs';
import { fuseMunicipalParkings } from './place-fusion.mjs';
import { parseArea } from './place-area.mjs';
import { loadAccessibility, registerAccessibility } from './accessibility-data.mjs';
import { parseReport } from './reports.mjs';
import { bounds, boundsOverlap } from '../shared/geo.mjs';
import { registerPlaceResearch } from './place-research.mjs';
import { registerReportPhoto } from './report-photo.mjs';
import { createBilling } from './billing.mjs';
import { osmGeneration } from './osm-generation.mjs';
export { getUser } from './auth.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CATEGORIES = new Set(['culture', 'food', 'toilet', 'transport', 'outdoors', 'accommodation', 'services']);
const normalize = value => value.toLocaleLowerCase('pl').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replaceAll('ł', 'l');

function wheelchairs() {
  const data = JSON.parse(readFileSync(resolve(ROOT, 'experiments/wheelchair-dimensions/comparison.json'), 'utf8'));
  return { summary: data.summary, wheelchairs: data.records.map(record => {
    const width = record.gkv_dimensions.overall_width[0];
    const status = ['match', 'conflict', 'insufficient'].includes(record.status) ? record.status : 'insufficient';
    return { id: record.gkv_id, name: record.model, manufacturer: record.manufacturer, status, sourceStatus: record.status,
      widthLabel: width?.raw_expression ?? 'Brak danych',
      widthCm: status === 'match' && width?.kind === 'scalar' && Number.isFinite(width.value_mm) && width.value_mm > 0 ? width.value_mm / 10 : null,
      sourceUrl: record.gkv_source_url, manufacturerSourceUrl: record.manufacturer_verification?.source_url ?? null,
      notes: record.manufacturer_verification?.reasoning ?? 'Dane katalogowe; zmierz własny wózek wraz z osprzętem.',
      dimensions: record.gkv_dimensions, manufacturerMeasurements: record.manufacturer_verification?.measurements ?? {},
      routeClearanceVerified: false, ...wheelchairPresentation(record) };
  }) };
}

export function createApp(options = {}) {
  const app = express();
  app.disable('x-powered-by');
  const dataDirectory = resolve(ROOT, 'server/data');
  const osm = options.placesPath || options.dbPath === ':memory:'
    ? { directory: dataDirectory, generation: null } : osmGeneration(dataDirectory);
  const store = openStore(options.dbPath ?? process.env.DB_PATH ?? resolve(ROOT, 'server/data/app.sqlite'),
    options.placesPath ?? resolve(osm.directory, 'places.json'), {
      municipalPath: options.municipalPath === undefined && !options.placesPath ? resolve(dataDirectory, 'municipal-stops.json') : options.municipalPath,
      // Also replace on rollback to the original directory, so records added by
      // the rejected first generation cannot survive in the shared source table.
      replaceOsm: !options.placesPath && options.dbPath !== ':memory:',
    });
  const orsBase = (options.orsBase ?? process.env.ORS_BASE_URL ?? 'http://127.0.0.1:18082/ors').replace(/\/$/, '');
  const fetchImpl = options.fetchImpl ?? fetch;
  app.locals.store = store;
  const auth = (options.authFactory ?? createAuth)(store.db, options.authOptions);
  const trips = createTrips(store.db);
  const context = { db: store.db, store, auth, getUser };
  const billing = createBilling(context, options.billingOptions);
  const accessibility = options.accessibility ?? loadAccessibility(options.accessibilityPath ?? ((options.dbPath === ':memory:' || options.placesPath) ? null : resolve(osm.directory, 'accessibility.json')));
  context.accessibility = accessibility;
  const closeStore = store.close.bind(store);
  store.close = () => { if (!options.accessibility) accessibility.close?.(); closeStore(); };
  app.locals.context = context;
  const publicReport = (report, user) => { const { userId, ...publicFields } = report; return { ...publicFields,
    isMine: Boolean(user && userId === user.id), canResolve: report.status === 'active' && (!userId || userId === user?.id) }; };
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    const origin = req.headers.origin;
    if (origin && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      const sameOrigin = origin === `${req.protocol}://${req.get('host')}`;
      if (!sameOrigin) return next(new ApiError(403, 'ORIGIN_DENIED', 'Ta lokalna demonstracja nie przyjmuje zgłoszeń z innych stron.'));
    }
    if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      res.set('Access-Control-Allow-Origin', origin).set('Vary', 'Origin');
      res.set('Access-Control-Allow-Credentials', 'true');
      res.set('Access-Control-Allow-Headers', 'Content-Type,Authorization').set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  billing.webhook(app);
  app.use('/api/place-passports', express.json({ limit: '128kb', strict: true }));
  app.use('/api/equipment/research', express.json({ limit: '9mb', strict: true }));
  app.use('/api/report-photos', express.json({ limit: '6mb', strict: true }));
  app.use('/api/mobility-presets', express.json({ limit: '128kb', strict: true }));
  app.use(express.json({ limit: '16kb', strict: true }));
  if (auth.middleware) app.use('/api', auth.middleware);
  app.use('/api', (req, _res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.body &&
        Object.hasOwn(req.body, 'expectedUserId') && req.body.expectedUserId !== (getUser(req)?.id ?? null))
      return next(new ApiError(409, 'ACCOUNT_CHANGED', 'Konto zmieniło się w innej karcie. Odśwież widok i spróbuj ponownie.'));
    next();
  });
  auth.registerRoutes(app);
  registerAccessibility(app, accessibility);
  context.mobilityPresets = registerMobilityPresets(app, context);
  registerEquipmentResearch(app, context, options.equipmentResearchOptions);
  registerReportPhoto(app, context, options.reportPhotoOptions);
  trips.registerRoutes(app);
  context.siteVerification = registerSiteVerificationRoutes(app, context, options.siteVerificationOptions);
  const passports = registerPlacePassportRoutes(app, context, options.passportOptions);
  context.passports = passports;
  billing.routes(app);
  const basePlaces = store.places.bind(store), basePlace = store.place.bind(store);
  // Project community publications at read time. Imported source rows stay intact.
  store.passportPlaces = () => passports.publishedPlaces();
  const parkings = options.parkings ?? ((options.placesPath || options.dbPath === ':memory:') && !options.parkingsPath ? [] : loadParkings(options.parkingsPath ?? resolve(osm.directory, 'parkings.json')));
  const municipalParkings = createMunicipalParkingsLayer(options.municipalParkingsPath === undefined
    ? ((options.placesPath || options.dbPath === ':memory:' || options.parkings) ? null : resolve(ROOT, 'server/data/municipal-parkings.json')) : options.municipalParkingsPath);
  store.municipalParkingSource = () => municipalParkings.current().source;
  let parkingStamp, combinedParkings;
  const currentParkings = () => {
    const city = municipalParkings.current(), stamp = JSON.stringify(city.status);
    if (stamp !== parkingStamp) { combinedParkings = fuseMunicipalParkings(parkings, city.places); parkingStamp = stamp; }
    return combinedParkings;
  };
  store.places = () => passports.projectPlaces([...new Map([...basePlaces(), ...currentParkings()].map(p => [p.id, p])).values()]);
  store.place = id => {
    const published = passports.getPlace(id);
    if (published?.passportRevision) return published;
    return currentParkings().find(p => p.id === id || p.sourceIds?.includes(id)) ?? published ?? basePlace(id);
  };
  registerPlaceResearch(app, context, options.placeResearchOptions);
  registerJourneys(app, context, { parkings: currentParkings, orsBase, fetchImpl, accessibility,
    driveBase: options.driveBase ?? process.env.ORS_DRIVE_BASE_URL ?? 'http://127.0.0.1:18083/ors', ...options.journeyOptions });
  registerLocations(app, context, options.locationsPath ?? resolve(osm.directory, 'locations.json'));
  app.get('/api/health', async (_req, res) => {
    let routing = 'unavailable';
    try { const r = await getJson(`${orsBase}/v2/health`, { fetchImpl, timeout: 2000 }); routing = r.ok && r.body.status === 'ready' ? 'ready' : 'unavailable'; } catch { /* DB remains usable without ORS. */ }
    res.json({ status: 'ok', routing, database: 'ready', places: store.places().length, accessibilityFeatures: accessibility.size,
      osmGeneration: osm.generation, timestamp: new Date().toISOString() });
  });
  app.get('/api/places', (req, res) => {
    const { q = '', category } = req.query;
    const limit = req.query.limit === undefined ? 60 : Number(req.query.limit);
    const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);
    if (typeof q !== 'string' || q.length > 150 || (category !== undefined && !CATEGORIES.has(category)) || !Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new ApiError(400, 'INVALID_INPUT', 'Niepoprawne kryteria wyszukiwania. Limit: 1–100.');
    if (!Number.isSafeInteger(offset) || offset < 0 || (req.query.offset !== undefined && (typeof req.query.offset !== 'string' || !/^\d+$/.test(req.query.offset))) ||
        (req.query.includeMap !== undefined && !['true', 'false'].includes(req.query.includeMap)))
      throw new ApiError(400, 'INVALID_INPUT', 'Niepoprawne parametry listy lub mapy.');
    let filters;
    try { filters = parsePlaceFilters(req.query); }
    catch (error) { throw new ApiError(400, 'INVALID_INPUT', error.message); }
    const query = normalize(q.trim());
    const area = parseArea(req.query);
    const unnamedBench = place => place.placeType === 'bench' && place.name === 'Ławka';
    const includeBenches = filters.placeType === 'bench' || filters.backrest || filters.armrest;
    const relevance = place => !query ? Number(unnamedBench(place)) : normalize(place.name) === query ? 0 : normalize(place.name).startsWith(query) ? 1 : normalize(place.name).includes(query) ? 2 : 3;
    const matching = store.places().filter(place => (!category || place.category === category) &&
      (place.placeType !== 'parking' || filters.placeType === 'parking' || category === 'transport' || Boolean(query)) &&
      (!unnamedBench(place) || includeBenches || category === 'outdoors' || query.includes('lawk')) &&
      matchesPlaceFilters(place, filters) &&
      (!query || normalize(`${place.name} ${place.address} ${place.description}`).includes(query)));
    const selected = matching.filter(place => area.contains(place.coordinates))
      .sort((a, b) => relevance(a) - relevance(b) || distance(a.coordinates, area.near) - distance(b.coordinates, area.near));
    const promoted = billing.promote(selected, getUser(req), { recommendations: Boolean(query || category) });
    const cityParkings = municipalParkings.current();
    // Lightweight map points cover all matching data, independently of the list's
    // page and optional area. Full source/accessibility facts are loaded on selection.
    const mapPlaces = req.query.includeMap === 'true'
      ? billing.promote(matching, getUser(req)).map(({ id, name, category, coordinates, promotion, municipalFacts }) => ({ id, name, category, coordinates, ...(promotion ? { promotion } : {}), ...(municipalFacts ? { municipalFacts: { stopCode: municipalFacts.stopCode } } : {}) }))
      : undefined;
    res.json({ places: promoted.slice(offset, offset + limit), mapPromotions: promoted.filter(place => place.promotion), total: selected.length,
      offset, nextOffset: offset + limit < selected.length ? offset + limit : null, mapPlaces,
      source: { ...store.source, datasets: [...store.source.datasets, ...(cityParkings.source ? [cityParkings.source] : [])] },
      municipalData: store.municipalStatus(), municipalParkingData: cityParkings.status });
  });
  app.get('/api/places/:id', (req, res) => {
    const place = store.place(req.params.id);
    if (!place) throw new ApiError(404, 'NOT_FOUND', 'Nie znaleziono miejsca.');
    res.json(place);
  });
  app.get('/api/wheelchairs', (_req, res) => res.json(wheelchairs()));
  app.get('/api/reports', (req, res) => res.json({ reports: store.reports().map(report => publicReport(report, getUser(req))) }));
  const parseObservation = body => {
    const data = parseReport(body);
    if (data.featureId) {
      const feature = accessibility.get(data.featureId);
      if (!feature || !boundsOverlap(bounds(feature.geometry, 10), bounds(data.geometry))) throw new ApiError(400, 'INVALID_FEATURE', 'Wskaż element mapy w miejscu obserwacji.');
    }
    return data;
  };
  app.post('/api/reports', (req, res) => {
    const data = parseObservation(req.body);
    if (store.reports().length >= 10000) throw new ApiError(409, 'REPORT_LIMIT', 'Osiągnięto limit zgłoszeń tej lokalnej demonstracji.');
    const user = getUser(req);
    const report = store.addReport({ ...data, userId: user?.id ?? null, description: data.description.trim() });
    const explorerReward = context.explorer?.awardReport(user, report);
    res.status(201).json({ ...publicReport(report, user), explorerReward });
  });
  app.put('/api/reports/:id', (req, res) => {
    const report = store.getReport(req.params.id), user = getUser(req);
    if (!report) throw new ApiError(404, 'NOT_FOUND', 'Nie znaleziono obserwacji.');
    if (!user || report.userId !== user.id) throw new ApiError(403, 'REPORT_OWNER_REQUIRED', 'Tylko zalogowany autor może poprawić obserwację.');
    if (report.status !== 'active') throw new ApiError(409, 'REPORT_RESOLVED', 'Ta obserwacja jest już zamknięta.');
    res.json(publicReport(store.updateReport(report.id, { ...parseObservation(req.body), revisedAt: new Date().toISOString() }, user.id), user));
  });
  app.post('/api/reports/:id/feedback', (req, res) => {
    const report = store.getReport(req.params.id), user = getUser(req);
    if (!user) throw new ApiError(401, 'AUTH_REQUIRED', 'Zaloguj się, aby potwierdzić obserwację lub zgłosić zmianę.');
    if (!report) throw new ApiError(404, 'NOT_FOUND', 'Nie znaleziono obserwacji.');
    if (report.status !== 'active') throw new ApiError(409, 'REPORT_RESOLVED', 'Ta obserwacja jest już zamknięta.');
    if (!['confirm', 'dispute'].includes(req.body?.action)) throw new ApiError(400, 'INVALID_INPUT', 'Wybierz potwierdzenie albo zgłoszenie zmiany.');
    const description = typeof req.body.description === 'string' ? req.body.description : '';
    const updated = store.confirmReport(report.id, user.id, req.body.action, description);
    const explorerReward = context.explorer?.awardFeedback(user, report, req.body.action, description);
    res.json({ ...publicReport(updated, user), explorerReward });
  });
  app.post('/api/reports/:id/resolve', (req, res) => {
    const current = store.getReport(req.params.id), user = getUser(req);
    if (current?.userId && current.userId !== user?.id) throw new ApiError(403, 'REPORT_OWNER_REQUIRED', 'Tylko autor może rozwiązać to zgłoszenie.');
    const report = store.resolveReport(req.params.id);
    if (!report) throw new ApiError(404, 'NOT_FOUND', 'Nie znaleziono zgłoszenia.');
    if (report.alreadyResolved) throw new ApiError(409, 'REPORT_ALREADY_RESOLVED', 'To zgłoszenie zostało już rozwiązane.');
    res.json(publicReport(report, user));
  });
  app.get('/api/community', (req, res) => {
    const reports = store.reports();
    res.json({ stats: { places: store.places().length, reports: reports.length, activeReports: reports.filter(r => r.status === 'active').length,
      resolvedReports: reports.filter(r => r.status === 'resolved').length }, recentReports: reports.slice(0, 20).map(report => publicReport(report, getUser(req))),
      notice: 'Obserwacje społeczności nie zastępują audytu. Stałe bariery pozostają widoczne; utrudnienia tymczasowe mają termin ważności. Sprzeczne informacje wymagają wyjaśnienia.' });
  });
  registerObservationRoutes(app, context);
  const stopSuggestions = createStopSuggestions(context);
  let runningRoutes = 0;
  app.post('/api/route', async (req, res) => {
    const input = parseRoute(req.body);
    if (runningRoutes >= 4) throw new ApiError(429, 'ROUTING_BUSY', 'Silnik liczy inne trasy. Spróbuj za chwilę.');
    runningRoutes++;
    try {
      const route = trips.personalize(await calculateRoute(input, store.reports(), { orsBase, fetchImpl, accessibility }), getUser(req), input.mobility);
      res.json({ ...route, stopSuggestions: stopSuggestions(route, [input.start, ...input.waypoints, input.end]) });
    }
    finally { runningRoutes--; }
  });
  registerGameRoutes(app, context);
  context.explorer = registerExplorerRoutes(app, context);
  registerFavorites(app, context);
  registerWheelchairSearch(app, context, options.wheelchairSearchOptions);
  options.mountRoutes?.(app, context);
  app.use('/api', (_req, _res, next) => next(new ApiError(404, 'NOT_FOUND', 'Ta funkcja jest obecnie niedostępna. Odśwież aplikację.')));
  app.use((error, _req, res, _next) => {
    const status = error instanceof ApiError ? error.status : error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : 500;
    if (status === 500) console.error('API internal error', error.name, error.code ?? 'UNKNOWN');
    res.status(status).json({ error: { code: error.code ?? (status === 413 ? 'BODY_TOO_LARGE' : status === 400 ? 'INVALID_JSON' : 'INTERNAL_ERROR'),
      message: error instanceof ApiError ? error.message : status === 413 ? 'Żądanie jest zbyt duże.' : status === 400 ? 'Nie udało się odczytać przesłanych danych. Spróbuj ponownie.' : 'Wystąpił błąd serwera.',
      ...(error.details ? { details: error.details } : {}) } });
  });
  return app;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
// Dedicated production entrypoints create their own instance; avoid loading the full catalog twice.
export const app = isMain || process.env.PRZEJSCIE_SKIP_DEFAULT_APP !== '1' ? createApp(isMain ? {} : { dbPath: ':memory:' }) : null;
if (isMain) {
  const port = Number(process.env.PORT ?? 3081), host = process.env.HOST ?? '127.0.0.1';
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) && process.env.ALLOW_REMOTE_ACCESS !== '1')
    throw new Error('Publiczny/LAN bind wymaga jawnego ALLOW_REMOTE_ACCESS=1. Lokalne konta nie zastępują TLS i moderacji.');
  const server = app.listen(port, host, () => console.log(`Kraków bez barier API: http://${host}:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { app.locals.store.close(); process.exit(0); }));
}
