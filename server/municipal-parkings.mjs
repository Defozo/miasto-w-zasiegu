import { readFileSync, writeFileSync, renameSync, mkdirSync, statSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { MUNICIPAL_STOPS_SOURCE } from './municipal-stops.mjs';

export const MUNICIPAL_PARKINGS_SOURCE = Object.freeze({ ...MUNICIPAL_STOPS_SOURCE,
  datasetId: 'ztp-park-and-ride', label: 'Parkingi Park and Ride w Krakowie',
  serviceUrl: 'https://services-eu1.arcgis.com/svTzSt3AvH7sK6q9/arcgis/rest/services/Park_and_Ride/FeatureServer/0',
});
const FIELDS = ['OBJECTID', 'Nazwa', 'm_ogolem', 'm_elektryczne', 'm_niepełnosp', 'stojaki', 'monitoring', 'infolinia', 'doba_parkingowa'];
const number = v => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 100000 ? v : null;
const text = v => typeof v === 'string' && v.trim() ? v.trim().slice(0, 300) : null;
const iso = v => Number.isFinite(v) && v >= 0 && v < 8640000000000000 ? new Date(v).toISOString() : null;
const validDate = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
function atomicJSON(path, value) {
  const temp = `${path}.${randomUUID()}.tmp`;
  try { writeFileSync(temp, JSON.stringify(value, null, 2), { flag: 'wx' }); renameSync(temp, path); }
  finally { try { unlinkSync(temp); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
}
function readSnapshot(path) {
  try {
    if (statSync(path).size > 4 * 1024 * 1024) return null;
    const data = JSON.parse(readFileSync(path, 'utf8'));
    if (data.schemaVersion !== 1 || data.source?.datasetId !== MUNICIPAL_PARKINGS_SOURCE.datasetId ||
        !['success', 'error'].includes(data.sync?.status) || !Array.isArray(data.places) || data.places.length > 1000 ||
        !validDate(data.sync.lastAttemptAt) || (data.sync.lastSuccessAt !== null && !validDate(data.sync.lastSuccessAt)) ||
        !data.places.every(p => /^ztp-parking-\d+$/.test(p.id) && p.placeType === 'parking' && validPoint(p.coordinates) &&
          p.verifiedAt === null && p.access?.wheelchair === 'unknown' && p.provenance?.datasetId === MUNICIPAL_PARKINGS_SOURCE.datasetId &&
          p.provenance?.verification === 'source-only' && validDate(p.provenance.fetchedAt))) return null;
    if (new Set(data.places.map(p => p.id)).size !== data.places.length) return null;
    if (data.sync.status === 'success' && (!data.places.length || !data.sync.lastSuccessAt)) return null;
    return data;
  } catch { return null; }
}
function bestSnapshot(path) {
  const main = readSnapshot(path), backup = readSnapshot(`${path}.last-good.json`);
  if (backup && (!main || Date.parse(backup.sync.lastSuccessAt) > (Date.parse(main.sync.lastSuccessAt) || 0)))
    return { ...backup, sync: { ...backup.sync, status: 'error', error: { code: 'SNAPSHOT_RECOVERED', message: 'Pokazujemy ostatnią poprawną kopię danych P+R.' } } };
  return main;
}
function validPoint(point) {
  return Array.isArray(point) && point.length === 2 && point.every(Number.isFinite) &&
    point[0] >= 19.75 && point[0] <= 20.25 && point[1] >= 49.9 && point[1] <= 50.2;
}
export function municipalParkingFromFeature(feature, { fetchedAt, sourceUpdatedAt }) {
  const a = feature?.attributes, coordinates = [feature?.geometry?.x, feature?.geometry?.y];
  if (!a || !Number.isSafeInteger(a.OBJECTID) || a.OBJECTID <= 0 || !text(a.Nazwa) || !validPoint(coordinates))
    throw new Error('Niepoprawny rekord P+R.');
  const source = MUNICIPAL_PARKINGS_SOURCE;
  const recordUrl = `${source.serviceUrl}/query?${new URLSearchParams({ objectIds: String(a.OBJECTID), outFields: FIELDS.join(','), outSR: '4326', f: 'pjson' })}`;
  return { id: `ztp-parking-${a.OBJECTID}`, name: text(a.Nazwa), placeType: 'parking', category: 'transport', coordinates,
    coordinateKind: 'source-point', description: 'Parking P+R z miejskiej ewidencji ZTP. Liczba miejsc nie oznacza bieżącej dostępności.',
    address: '', verifiedAt: null, sourceLabel: source.publisher, sourceUrl: recordUrl,
    access: { wheelchair: 'unknown', widthCm: null, surface: null, toilet: 'unknown', entranceNotes: 'Źródło miejskie nie opisuje wjazdu ani dostępnego wyjścia z parkingu.' },
    parking: { type: 'park-and-ride', capacity: number(a.m_ogolem)?.toString() ?? null, disabledSpaces: number(a.m_niepełnosp)?.toString() ?? null,
      maxHeight: null, vehicleEntrance: null, mobilityExit: null, alightingPoint: null, transferVerified: false },
    municipalParkingFacts: { capacity: number(a.m_ogolem), disabledSpaces: number(a.m_niepełnosp),
      electricSpaces: number(a.m_elektryczne), operatingHours: text(a.doba_parkingowa), informationPhone: text(a.infolinia) },
    provenance: { datasetId: source.datasetId, publisher: source.publisher, datasetUrl: source.datasetUrl, recordUrl,
      recordId: String(a.OBJECTID), recordUpdatedAt: null, sourceUpdatedAt, fetchedAt,
      termsUrl: source.termsUrl, attribution: source.attribution, verification: 'source-only' } };
}
export async function syncMunicipalParkings({ path, fetchImpl = fetch, now = () => Date.now() }) {
  mkdirSync(dirname(path), { recursive: true });
  const lockPath = `${path}.lock`, lock = openSync(lockPath, 'wx');
  const previous = bestSnapshot(path), started = now(), lastAttemptAt = new Date(started).toISOString();
  try {
    const get = async url => {
      const remaining = 60000 - (now() - started);
      if (remaining <= 0) throw new Error('Przekroczono czas importu P+R.');
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(Math.min(12000, remaining)), redirect: 'error' });
      if (!response.ok) throw new Error(`Źródło P+R odpowiedziało HTTP ${response.status}.`);
      const reader = response.body.getReader(), chunks = []; let length = 0;
      try {
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          length += value.length;
          if (length > 2 * 1024 * 1024) { await reader.cancel(); throw new Error('Odpowiedź P+R przekroczyła limit rozmiaru.'); }
          chunks.push(Buffer.from(value));
        }
      } finally { reader.releaseLock(); }
      const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (result.error) throw new Error('Usługa P+R zwróciła błąd.');
      return result;
    };
    const url = MUNICIPAL_PARKINGS_SOURCE.serviceUrl;
    const meta = await get(`${url}?f=json`), sourceUpdatedAt = iso(meta.editingInfo?.dataLastEditDate);
    if (!FIELDS.every(name => meta.fields?.some(field => field.name === name)) || meta.geometryType !== 'esriGeometryPoint' ||
        (sourceUpdatedAt && Date.parse(sourceUpdatedAt) > started + 300000)) throw new Error('Zmienił się format lub czas danych P+R.');
    const count = await get(`${url}/query?where=1%3D1&returnCountOnly=true&f=json`);
    if (!Number.isInteger(count.count) || count.count < 1 || count.count > 1000) throw new Error('Nieoczekiwana liczba parkingów P+R.');
    const data = await get(`${url}/query?${new URLSearchParams({ where: '1=1', outFields: FIELDS.join(','), outSR: '4326', f: 'json', returnGeometry: 'true' })}`);
    if (data.exceededTransferLimit || !Array.isArray(data.features) || data.features.length !== count.count ||
        (data.spatialReference?.wkid ?? data.spatialReference?.latestWkid) !== 4326) throw new Error('Niekompletna odpowiedź P+R.');
    const places = data.features.map(feature => municipalParkingFromFeature(feature, { fetchedAt: lastAttemptAt, sourceUpdatedAt }));
    if (new Set(places.map(p => p.id)).size !== places.length || (previous?.places.length && places.length < previous.places.length / 2))
      throw new Error('Niespójna liczba parkingów P+R.');
    if (iso((await get(`${url}?f=json`)).editingInfo?.dataLastEditDate) !== sourceUpdatedAt) throw new Error('Źródło P+R zmieniło się podczas importu.');
    const snapshot = { schemaVersion: 1, source: MUNICIPAL_PARKINGS_SOURCE, places,
      sync: { status: 'success', lastAttemptAt, lastSuccessAt: new Date(now()).toISOString(), sourceUpdatedAt, error: null, counts: { included: places.length } } };
    atomicJSON(`${path}.last-good.json`, snapshot); atomicJSON(path, snapshot); return snapshot;
  } catch {
    const snapshot = { schemaVersion: 1, source: MUNICIPAL_PARKINGS_SOURCE, places: previous?.places ?? [],
      sync: { status: 'error', lastAttemptAt, lastSuccessAt: previous?.sync.lastSuccessAt ?? null, sourceUpdatedAt: previous?.sync.sourceUpdatedAt ?? null,
        error: { code: 'IMPORT_FAILED', message: 'Nie udało się odświeżyć danych P+R. Zachowano ostatnią poprawną kopię, jeśli była dostępna.' } } };
    atomicJSON(path, snapshot); return snapshot;
  } finally { closeSync(lock); unlinkSync(lockPath); }
}

export function createMunicipalParkingsLayer(path, { now = () => Date.now() } = {}) {
  let cached = null, stamp = null;
  const fileStamp = file => { try { const s = statSync(file); return `${s.mtimeMs}:${s.ctimeMs}:${s.size}`; } catch { return 'missing'; } };
  return { current() {
    if (!path) return { places: [], source: null, status: { status: 'missing', available: false } };
    const nextStamp = `${fileStamp(path)}|${fileStamp(`${path}.last-good.json`)}`;
    if (stamp !== nextStamp) {
      const next = bestSnapshot(path);
      if (next) cached = next;
      else if (cached) cached = { ...cached, sync: { ...cached.sync, status: 'error', error: { code: 'SNAPSHOT_UNAVAILABLE', message: 'Nie można odczytać najnowszych danych P+R.' } } };
      stamp = nextStamp;
    }
    if (!cached) return { places: [], source: null, status: { status: nextStamp === 'missing|missing' ? 'missing' : 'error', available: false } };
    const stale = !cached.sync.lastSuccessAt || now() - Date.parse(cached.sync.lastSuccessAt) > 48 * 3600000 ||
      [cached.sync.lastSuccessAt, cached.sync.sourceUpdatedAt, cached.sync.lastAttemptAt].some(date => date && Date.parse(date) > now() + 300000);
    return { source: cached.source, status: { ...cached.sync, available: !!cached.sync.lastSuccessAt, stale },
      places: cached.places.map(p => ({ ...p, provenance: { ...p.provenance, stale, syncStatus: cached.sync.status } })) };
  } };
}
