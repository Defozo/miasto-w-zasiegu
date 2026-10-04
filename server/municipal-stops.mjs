import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { coordinates } from './routing.mjs';

export const MUNICIPAL_STOPS_SOURCE = Object.freeze({
  datasetId: 'ztp-kmk-stops',
  label: 'Przystanki Komunikacji Miejskiej w Krakowie',
  publisher: 'Zarząd Transportu Publicznego w Krakowie',
  datasetUrl: 'https://otwartedane.um.krakow.pl/zbiory-danych/komunikacja-miejska-w-krakowie-kmk',
  serviceUrl: 'https://services-eu1.arcgis.com/svTzSt3AvH7sK6q9/arcgis/rest/services/Przystanki_Komunikacji_Miejskiej_w_Krakowie/FeatureServer/0',
  termsUrl: 'https://otwartedane.um.krakow.pl/warunki-wykorzystania-danych-udostepnianych-w-portalu',
  attribution: 'Gmina Miejska Kraków, otwartedane.um.krakow.pl; Zarząd Transportu Publicznego w Krakowie',
  terms: 'Bezpłatne ponowne wykorzystanie na warunkach portalu: wskazanie źródła oraz czasu wytworzenia i pozyskania danych. Brak deklaracji standardowej licencji CC.',
  refreshIntervalHours: 24,
  bbox: [19.75, 49.9, 20.25, 50.2],
});

// A whitelist deliberately excludes Editor and unrelated tracking information.
export const MUNICIPAL_STOP_FIELDS = [
  'OBJECTID', 'GlobalID', 'kod_busman', 'Nazwa_przystanku_nr', 'Typ_przystanku',
  'Nawierzchnia_peronu', 'Krawężnik_peronowy', 'Ławki_poza_wiatą', 'Wiata_liczba',
  'EditDate', 'validFrom', 'validUntil', 'Grupa',
];
const MAX_RECORDS = 20000;
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const CLOCK_TOLERANCE_MS = 5 * 60000;
const TYPES = {
  A: 'Autobusowy', T: 'Tramwajowy', TA: 'Tramwajowo-autobusowy',
  tymA: 'Tymczasowy autobusowy', tymT: 'Tymczasowy tramwajowy', tymTA: 'Tymczasowy tramwajowo-autobusowy',
  pA: 'Peron autobusowy', pT: 'Peron tramwajowy', pTA: 'Peron tramwajowo-autobusowy',
};
const SURFACES = { kostka: 'Kostka', płyty_chodnikowe: 'Płyty chodnikowe', beton: 'Beton', asfalt: 'Asfalt',
  utwardzone_inne: 'Inna nawierzchnia utwardzona', nieutwardzne_inne: 'Inna nawierzchnia nieutwardzona' };
const KERBS = { tak: 'Krawężnik peronowy', nie: 'Brak krawężnika peronowego w opisie źródła',
  'kassel-kerb': 'Profilowany krawężnik przystankowy (Kassel)' };
const label = (labels, value, unknown) => Object.hasOwn(labels, value) ? labels[value] : unknown;
const text = value => typeof value === 'string' && value.trim() ? value.trim().slice(0, 300) : null;
const count = value => Number.isInteger(value) && value >= 0 && value <= 1000 ? value : null;
const iso = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 8640000000000000
  ? new Date(value).toISOString() : null;
const validISO = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const pointValid = point => { try { coordinates(point); return true; } catch { return false; } };

export class MunicipalSyncError extends Error {
  constructor(code, message) { super(message); this.name = 'MunicipalSyncError'; this.code = code; }
}
const fail = (code, message) => { throw new MunicipalSyncError(code, message); };

export function municipalStopFromFeature(feature, { fetchedAt, sourceUpdatedAt, now = Date.now() }) {
  const a = feature?.attributes;
  if (!a || !Number.isSafeInteger(a.OBJECTID) || a.OBJECTID <= 0 || !text(a.Nazwa_przystanku_nr))
    fail('INVALID_RECORD', 'Źródło zwróciło przystanek bez poprawnego identyfikatora lub nazwy.');
  const position = [feature.geometry?.x, feature.geometry?.y];
  if (!pointValid(position)) return { excluded: 'outsideAreaOrInvalidGeometry' };
  if (a.Grupa !== 'KMK') return { excluded: 'nonPublicOrInactiveGroup' };
  if (!Object.hasOwn(TYPES, a.Typ_przystanku)) return { excluded: 'nonPassengerStopType' };
  const validFrom = iso(a.validFrom), validUntil = iso(a.validUntil);
  if ((a.validFrom != null && !validFrom) || (a.validUntil != null && !validUntil) ||
      (validFrom && validUntil && Date.parse(validUntil) <= Date.parse(validFrom)))
    return { excluded: 'invalidValidity' };
  if (validFrom && Date.parse(validFrom) > now) return { excluded: 'notYetValid' };
  if (validUntil && Date.parse(validUntil) <= now) return { excluded: 'expired' };
  const recordUpdatedAt = iso(a.EditDate);
  if (recordUpdatedAt && Date.parse(recordUpdatedAt) > now + CLOCK_TOLERANCE_MS)
    fail('SOURCE_TIME_INVALID', 'Źródło podaje datę zmiany przystanku z przyszłości. Nie potwierdzono aktualizacji.');
  const globalId = text(a.GlobalID)?.replace(/[{}]/g, '').toLowerCase();
  const recordId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(globalId ?? '')
    ? globalId : String(a.OBJECTID);
  const recordUrl = `${MUNICIPAL_STOPS_SOURCE.serviceUrl}/query?${new URLSearchParams({
    objectIds: String(a.OBJECTID), outFields: MUNICIPAL_STOP_FIELDS.join(','), outSR: '4326', f: 'pjson',
  })}`;
  const rawFacts = Object.fromEntries(MUNICIPAL_STOP_FIELDS.filter(field => !['GlobalID', 'OBJECTID'].includes(field))
    .map(field => [field, typeof a[field] === 'string' ? text(a[field]) : typeof a[field] === 'number' && Number.isFinite(a[field]) ? a[field] : null]));
  return { place: {
    id: `ztp-stop-${recordId}`, name: text(a.Nazwa_przystanku_nr), category: 'transport', placeType: 'transit_stop',
    coordinates: position, coordinateKind: 'source-point',
    description: 'Przystanek komunikacji miejskiej. Dane o wyposażeniu i peronie pochodzą z miejskiej ewidencji.',
    address: 'Punkt przystanku; adres budynku nie został podany w źródle.',
    access: { wheelchair: 'unknown', widthCm: null, surface: null, toilet: 'unknown',
      entranceNotes: 'Punkt przystanku ze źródła miejskiego; nie potwierdzono dostępnego dojścia ani wjazdu do pojazdu.' },
    verifiedAt: null, sourceLabel: MUNICIPAL_STOPS_SOURCE.publisher, sourceUrl: recordUrl,
    municipalFacts: {
      stopCode: text(a.kod_busman), stopType: TYPES[a.Typ_przystanku],
      platformSurface: text(a.Nawierzchnia_peronu) ? label(SURFACES, a.Nawierzchnia_peronu, 'Inny rodzaj nawierzchni w opisie źródła') : null,
      kerbType: text(a.Krawężnik_peronowy) ? label(KERBS, a.Krawężnik_peronowy, 'Inny rodzaj krawężnika w opisie źródła') : null,
      benchesOutsideShelter: count(a.Ławki_poza_wiatą), shelters: count(a.Wiata_liczba), validFrom, validUntil,
    },
    provenance: {
      datasetId: MUNICIPAL_STOPS_SOURCE.datasetId, publisher: MUNICIPAL_STOPS_SOURCE.publisher,
      datasetUrl: MUNICIPAL_STOPS_SOURCE.datasetUrl, recordUrl, recordId, objectId: a.OBJECTID,
      recordUpdatedAt, fetchedAt, sourceUpdatedAt,
      termsUrl: MUNICIPAL_STOPS_SOURCE.termsUrl, attribution: MUNICIPAL_STOPS_SOURCE.attribution,
      verification: 'source-only', rawFacts,
    },
  } };
}

function validateSnapshot(value) {
  if (value?.schemaVersion !== 1 || value.source?.datasetId !== MUNICIPAL_STOPS_SOURCE.datasetId ||
      !value.sync || !['success', 'error'].includes(value.sync.status) || !validISO(value.sync.lastAttemptAt) ||
      (value.sync.lastSuccessAt !== null && !validISO(value.sync.lastSuccessAt)) ||
      !Array.isArray(value.places) || value.places.length > MAX_RECORDS) throw new Error('Invalid municipal snapshot');
  if (value.sync.status === 'success' && (!value.sync.lastSuccessAt || value.places.length === 0))
    throw new Error('A successful municipal snapshot must contain data');
  const ids = new Set();
  for (const place of value.places) {
    if (!/^ztp-stop-[a-z0-9-]+$/.test(place.id) || ids.has(place.id) || !pointValid(place.coordinates) ||
        !text(place.name) || place.category !== 'transport' || place.coordinateKind !== 'source-point' ||
        place.access?.wheelchair !== 'unknown' || place.access?.widthCm !== null || place.verifiedAt !== null ||
        place.provenance?.datasetId !== MUNICIPAL_STOPS_SOURCE.datasetId || !validISO(place.provenance.fetchedAt) ||
        place.provenance.verification !== 'source-only' || !place.municipalFacts ||
        (place.municipalFacts.validFrom !== null && !validISO(place.municipalFacts.validFrom)) ||
        (place.municipalFacts.validUntil !== null && !validISO(place.municipalFacts.validUntil)))
      throw new Error('Invalid municipal record');
    ids.add(place.id);
  }
  return value;
}

function readSnapshot(path) {
  if (statSync(path).size > MAX_FILE_BYTES) throw new Error('Municipal snapshot too large');
  return validateSnapshot(JSON.parse(readFileSync(path, 'utf8')));
}

function bestSnapshot(path) {
  let main = null, backup = null;
  try { main = readSnapshot(path); } catch { /* A validated backup may remain. */ }
  try { backup = readSnapshot(`${path}.last-good.json`); } catch { /* Main can stand alone. */ }
  const updated = value => value?.sync.lastSuccessAt ? Date.parse(value.sync.lastSuccessAt) : -Infinity;
  if (backup?.places.length && (!main || updated(backup) > updated(main))) {
    // A process can end between committing last-good and committing the main
    // file. Keep the newest validated data, but retain the publication failure.
    return { ...backup, sync: { ...backup.sync, status: 'error',
      lastAttemptAt: main?.sync.lastAttemptAt ?? backup.sync.lastAttemptAt,
      error: main?.sync.error ?? { code: 'SNAPSHOT_RECOVERED', message: 'Pokazujemy ostatnią poprawną kopię. Nie potwierdzono publikacji najnowszej aktualizacji.' },
    } };
  }
  return main;
}

function atomicJSON(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  let fd;
  try {
    fd = openSync(temporary, 'wx');
    writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`);
    fsyncSync(fd); closeSync(fd); fd = undefined;
    renameSync(temporary, path);
  } finally {
    if (fd !== undefined) closeSync(fd);
    try { unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

async function getJSON(url, fetchImpl, remaining) {
  let response;
  try { response = await fetchImpl(url, { signal: AbortSignal.timeout(Math.max(1, Math.min(12000, remaining))), redirect: 'error', headers: { Accept: 'application/json' } }); }
  catch { fail('SOURCE_UNAVAILABLE', 'Nie udało się pobrać aktualnych danych przystanków.'); }
  if (!response.ok) fail('SOURCE_HTTP_ERROR', `Źródło przystanków odpowiedziało błędem HTTP ${response.status}.`);
  const reader = response.body?.getReader();
  if (!reader) fail('INVALID_RESPONSE', 'Źródło nie zwróciło treści danych.');
  const chunks = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > MAX_RESPONSE_BYTES) { await reader.cancel(); fail('RESPONSE_TOO_LARGE', 'Odpowiedź źródła przekroczyła limit rozmiaru.'); }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    if (error instanceof MunicipalSyncError) throw error;
    fail('SOURCE_UNAVAILABLE', 'Pobieranie danych przystanków zostało przerwane.');
  } finally { reader.releaseLock(); }
  let json;
  try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { fail('INVALID_RESPONSE', 'Źródło zwróciło niepoprawne dane.'); }
  if (json.error) fail('SOURCE_ERROR', 'Miejska usługa zgłosiła błąd zapytania.');
  return json;
}

export async function syncMunicipalStops({ path, fetchImpl = fetch, now = () => Date.now(), pageSize = 500 } = {}) {
  if (!path || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) throw new Error('Invalid importer arguments');
  mkdirSync(dirname(path), { recursive: true });
  const lockPath = `${path}.lock`;
  let lock;
  try { lock = openSync(lockPath, 'wx'); }
  catch (error) { if (error.code === 'EEXIST') fail('IMPORT_LOCKED', 'Inny import przystanków jest w toku.'); throw error; }
  const started = now(), lastAttemptAt = new Date(started).toISOString();
  const previous = bestSnapshot(path);
  try {
    writeFileSync(lock, JSON.stringify({ pid: process.pid, startedAt: lastAttemptAt }));
    const read = async url => {
      const remaining = 120000 - (now() - started);
      if (remaining <= 0) fail('IMPORT_TIMEOUT', 'Aktualizacja przystanków przekroczyła limit czasu.');
      return getJSON(url, fetchImpl, remaining);
    };
    const serviceUrl = MUNICIPAL_STOPS_SOURCE.serviceUrl;
    const meta = await read(`${serviceUrl}?f=json`);
    if (!Array.isArray(meta.fields) || !MUNICIPAL_STOP_FIELDS.every(name => meta.fields.some(field => field.name === name)) ||
        !meta.advancedQueryCapabilities?.supportsPagination || !meta.advancedQueryCapabilities?.supportsOrderBy)
      fail('SCHEMA_CHANGED', 'Zmienił się format miejskich danych przystanków.');
    if (meta.dateFieldsTimeReference?.timeZone && !['UTC', 'Etc/UTC'].includes(meta.dateFieldsTimeReference.timeZone))
      fail('TIMEZONE_CHANGED', 'Źródło zmieniło sposób zapisywania czasu obowiązywania przystanków.');
    const sourceUpdatedAt = iso(meta.editingInfo?.dataLastEditDate);
    if (sourceUpdatedAt && Date.parse(sourceUpdatedAt) > started + CLOCK_TOLERANCE_MS)
      fail('SOURCE_TIME_INVALID', 'Źródło podaje datę aktualizacji z przyszłości. Nie potwierdzono aktualizacji.');
    const baseQuery = { where: '1=1', geometry: MUNICIPAL_STOPS_SOURCE.bbox.join(','), geometryType: 'esriGeometryEnvelope',
      inSR: '4326', spatialRel: 'esriSpatialRelIntersects', f: 'json' };
    const queryURL = extra => `${serviceUrl}/query?${new URLSearchParams({ ...baseQuery, ...extra })}`;
    const totals = await read(queryURL({ returnCountOnly: 'true' }));
    if (!Number.isInteger(totals.count) || totals.count < 1 || totals.count > MAX_RECORDS)
      fail('UNEXPECTED_COUNT', 'Źródło zwróciło pusty lub nieoczekiwanie duży zbiór przystanków.');
    const places = [], objectIds = new Set(), placeIds = new Set(), excluded = {};
    let pages = 0, received = 0;
    while (received < totals.count) {
      if (++pages > MAX_RECORDS || received > MAX_RECORDS) fail('PAGINATION_ERROR', 'Nie udało się zakończyć pobierania stron danych.');
      const data = await read(queryURL({ outFields: MUNICIPAL_STOP_FIELDS.join(','), outSR: '4326', returnGeometry: 'true',
        orderByFields: 'OBJECTID ASC', resultOffset: String(received), resultRecordCount: String(pageSize) }));
      if (!Array.isArray(data.features) || data.features.length === 0 || data.features.length > pageSize ||
          ![4326].includes(data.spatialReference?.wkid ?? data.spatialReference?.latestWkid))
        fail('PAGINATION_ERROR', 'Strona miejskich danych jest niekompletna lub ma inny układ współrzędnych.');
      for (const feature of data.features) {
        if (objectIds.has(feature.attributes?.OBJECTID)) fail('PAGINATION_ERROR', 'Źródło powtórzyło rekord podczas pobierania.');
        objectIds.add(feature.attributes?.OBJECTID);
        const result = municipalStopFromFeature(feature, { fetchedAt: lastAttemptAt, sourceUpdatedAt, now: started });
        if (result.excluded) excluded[result.excluded] = (excluded[result.excluded] ?? 0) + 1;
        else {
          if (placeIds.has(result.place.id)) fail('DUPLICATE_ID', 'Źródło powtórzyło identyfikator przystanku.');
          placeIds.add(result.place.id); places.push(result.place);
        }
      }
      received += data.features.length;
      if (data.exceededTransferLimit === false && received < totals.count)
        fail('SOURCE_CHANGED', 'Liczba przystanków zmieniła się podczas pobierania.');
      if (received >= totals.count && data.exceededTransferLimit === true)
        fail('SOURCE_CHANGED', 'Źródło ma więcej rekordów niż zadeklarowano przed pobraniem.');
    }
    const endMeta = await read(`${serviceUrl}?f=json`);
    if (received !== totals.count || iso(endMeta.editingInfo?.dataLastEditDate) !== sourceUpdatedAt)
      fail('SOURCE_CHANGED', 'Dane przystanków zmieniły się podczas pobierania.');
    if (places.length === 0 || (previous?.places.length && places.length < previous.places.length * 0.5))
      fail('UNEXPECTED_DROP', 'Liczba aktualnych przystanków gwałtownie spadła. Zachowano poprzednią kopię do sprawdzenia.');
    const snapshot = validateSnapshot({ schemaVersion: 1, source: MUNICIPAL_STOPS_SOURCE,
      sync: { status: 'success', lastAttemptAt, lastSuccessAt: new Date(now()).toISOString(), sourceUpdatedAt,
        error: null, counts: { sourceInArea: totals.count, received, included: places.length, excluded, pages } },
      places: places.sort((a, b) => a.id.localeCompare(b.id)),
    });
    atomicJSON(`${path}.last-good.json`, snapshot);
    atomicJSON(path, snapshot);
    return snapshot;
  } catch (error) {
    const failure = error instanceof MunicipalSyncError ? { code: error.code, message: error.message }
      : { code: 'IMPORT_FAILED', message: 'Aktualizacja przystanków nie została zakończona. Zachowano ostatni poprawny zestaw, jeśli istniał.' };
    const snapshot = { schemaVersion: 1, source: MUNICIPAL_STOPS_SOURCE,
      sync: { status: 'error', lastAttemptAt, lastSuccessAt: previous?.sync.lastSuccessAt ?? null,
        sourceUpdatedAt: previous?.sync.sourceUpdatedAt ?? null, counts: previous?.sync.counts ?? null, error: failure },
      places: previous?.places ?? [],
    };
    atomicJSON(path, snapshot);
    return snapshot;
  } finally { closeSync(lock); unlinkSync(lockPath); }
}

// Keep municipal objects out of the OSM table. A removed/expired municipal object
// must not reappear from a previous import persisted in SQLite.
export function createMunicipalStopsLayer(path, { now = () => Date.now() } = {}) {
  let cached = null, stamp = null, readError = false;
  function fileStamp(file) {
    try { const stat = statSync(file); return `${stat.mtimeMs}:${stat.ctimeMs}:${stat.ino}:${stat.size}`; }
    catch (error) { return error.code === 'ENOENT' ? 'missing' : 'unreadable'; }
  }
  function current() {
    if (!path) return { places: [], source: null, status: { available: false, status: 'missing', stale: false, lastAttemptAt: null, lastSuccessAt: null, error: null } };
    const nextStamp = `${fileStamp(path)}|${fileStamp(`${path}.last-good.json`)}`;
    if (nextStamp !== stamp) {
      const next = bestSnapshot(path);
      readError = !next && (nextStamp !== 'missing|missing' || Boolean(cached));
      if (next) cached = next;
      stamp = nextStamp;
    }
    if (!cached) return { places: [], source: null, status: { available: false, status: readError ? 'error' : 'missing', stale: false,
      lastAttemptAt: null, lastSuccessAt: null, error: readError ? { code: 'SNAPSHOT_UNAVAILABLE', message: 'Nie można odczytać miejskich danych przystanków.' } : null } };
    const timestamp = now();
    const clockProblem = [cached.sync.lastSuccessAt, cached.sync.lastAttemptAt, cached.sync.sourceUpdatedAt]
      .some(value => value && Date.parse(value) > timestamp + CLOCK_TOLERANCE_MS);
    const stale = clockProblem || !cached.sync.lastSuccessAt || timestamp - Date.parse(cached.sync.lastSuccessAt) > 48 * 3600000;
    const status = { ...cached.sync, status: readError || clockProblem ? 'error' : cached.sync.status, available: Boolean(cached.sync.lastSuccessAt), stale,
      ...(readError ? { error: { code: 'SNAPSHOT_UNAVAILABLE', message: 'Nie można odczytać najnowszego zestawu. Pokazujemy ostatnią poprawną kopię.' } } : {}) };
    if (clockProblem) status.error = { code: 'CLOCK_MISMATCH', message: 'Daty aktualizacji nie zgadzają się z bieżącym czasem. Nie można potwierdzić świeżości danych.' };
    const places = cached.places.filter(place => (!place.municipalFacts.validFrom || Date.parse(place.municipalFacts.validFrom) <= timestamp) &&
      (!place.municipalFacts.validUntil || Date.parse(place.municipalFacts.validUntil) > timestamp))
      .map(place => ({ ...place, provenance: { ...place.provenance, syncStatus: status.status, stale, lastSyncAttemptAt: status.lastAttemptAt } }));
    return { places, source: cached.source, status: { ...status, activeNow: places.length } };
  }
  return { current };
}
