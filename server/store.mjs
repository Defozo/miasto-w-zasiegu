import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createMunicipalStopsLayer } from './municipal-stops.mjs';
import { fuseMunicipalStops } from './place-fusion.mjs';
import { ensureReports, enrichReport, addReportEvent } from './reports.mjs';

export const REPORT_FRESH_HOURS = 24;
export function reportView(row, now = Date.now()) {
  const ageHours = Math.max(0, (now - Date.parse(row.created_at)) / 3600000);
  return { id: row.id, kind: row.kind, coordinates: [row.lon, row.lat], description: row.description,
    userId: row.user_id ?? null,
    widthCm: row.width_cm, status: row.status, createdAt: row.created_at, resolvedAt: row.resolved_at,
    ageHours: Math.round(ageHours * 10) / 10, stale: ageHours > REPORT_FRESH_HOURS,
    sourceLabel: 'Zgłoszenie społeczności · niezweryfikowane terenowo' };
}

export function openStore(path, placesPath, options = {}) {
  const imported = JSON.parse(readFileSync(placesPath, 'utf8'));
  if (options.replaceOsm && (!Array.isArray(imported.places) || !imported.places.length ||
      imported.places.some(p => typeof p.id !== 'string' || !p.id.startsWith('osm-')) ||
      new Set(imported.places.map(p => p.id)).size !== imported.places.length))
    throw new Error('Refusing to replace OSM places with an invalid snapshot');
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
    CREATE TABLE IF NOT EXISTS places (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, lon REAL NOT NULL, lat REAL NOT NULL,
      description TEXT NOT NULL, width_cm REAL, status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL, resolved_at TEXT);
    CREATE INDEX IF NOT EXISTS reports_created ON reports(created_at);`);
  if (!db.prepare('PRAGMA table_info(reports)').all().some(column => column.name === 'user_id'))
    db.exec('ALTER TABLE reports ADD COLUMN user_id TEXT');
  ensureReports(db);
  const viewReport = row => enrichReport(row, db.prepare('SELECT data FROM report_details WHERE report_id=?').get(row.id),
    db.prepare('SELECT * FROM report_events WHERE report_id=? ORDER BY created_at,id').all(row.id));
  const municipal = createMunicipalStopsLayer(options.municipalPath === undefined
    ? resolve(dirname(placesPath), 'municipal-stops.json') : options.municipalPath, { now: options.now });
  const insertPlace = db.prepare('INSERT INTO places(id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data');
  db.exec('BEGIN');
  try {
    // Source rows are replaceable; accounts, reports and passport revisions live
    // in separate tables and must survive refreshes and source deletions.
    if (options.replaceOsm) db.exec("DELETE FROM places WHERE id GLOB 'osm-*'");
    for (const original of imported.places) {
      const place = original.id.startsWith('osm-') ? { ...original, provenance: {
        datasetId: 'osm-geofabrik-malopolskie', publisher: 'Społeczność OpenStreetMap',
        datasetUrl: imported.source?.url ?? 'https://download.geofabrik.de/europe/poland/malopolskie.html',
        recordUrl: original.sourceUrl, recordId: original.id, recordUpdatedAt: original.osmUpdatedAt ?? null,
        importedAt: imported.importedAt ?? null, snapshotAt: imported.source?.snapshotDate ?? null,
        verification: 'source-only', termsUrl: 'https://www.openstreetmap.org/copyright',
        attribution: imported.source?.attribution ?? '© OpenStreetMap contributors',
      } } : original;
      insertPlace.run(place.id, JSON.stringify(place));
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  let sourceStamp, sourcePlaces, fusionStamp, fusionPlaces;
  const fusedPlaces = () => {
    const stamp = `${db.prepare('PRAGMA data_version').get().data_version}:${db.prepare('SELECT total_changes() AS n').get().n}`;
    if (stamp !== sourceStamp) { sourcePlaces = db.prepare('SELECT data FROM places').all().map(row => JSON.parse(row.data)); sourceStamp = stamp; fusionStamp = null; }
    const city = municipal.current(), next = `${JSON.stringify(city.status)}:${city.places.map(p => p.id).join(',')}`;
    if (next !== fusionStamp) { fusionPlaces = fuseMunicipalStops(sourcePlaces, city.places); fusionStamp = next; }
    return fusionPlaces;
  };
  return {
    db, get source() { const extra = municipal.current().source; return { ...imported.source, datasets: [imported.source, ...(extra ? [extra] : [])] }; },
    municipalStatus: () => municipal.current().status,
    municipalPlaces: () => fusedPlaces().filter(place => place.provenance?.datasetId === 'ztp-kmk-stops'),
    osmPlaces: () => { fusedPlaces(); return sourcePlaces; },
    places: fusedPlaces,
    place: id => {
      if (id.startsWith('ztp-stop-') || id.startsWith('osm-')) {
        const fused = fusedPlaces().find(place => place.id === id || place.sourceIds?.includes(id));
        if (fused) return fused.id === id ? fused : { ...fused, id, canonicalId: fused.id };
        if (id.startsWith('ztp-stop-')) return null;
      }
      const row = db.prepare('SELECT data FROM places WHERE id=?').get(id); return row ? JSON.parse(row.data) : null;
    },
    reports: () => db.prepare('SELECT * FROM reports ORDER BY created_at DESC, id').all().map(viewReport),
    getReport: id => { const row = db.prepare('SELECT * FROM reports WHERE id=?').get(id); return row ? viewReport(row) : null; },
    addReport(data) {
      const id = randomUUID(), createdAt = new Date().toISOString();
      db.exec('BEGIN');
      try {
      db.prepare('INSERT INTO reports(id,kind,lon,lat,description,width_cm,created_at,user_id) VALUES(?,?,?,?,?,?,?,?)')
        .run(id, data.kind, data.coordinates[0], data.coordinates[1], data.description, data.widthCm ?? null, createdAt, data.userId ?? null);
      if (data.schemaVersion === 2) {
        const { userId, ...publicData } = data;
        db.prepare('INSERT INTO report_details(report_id,data) VALUES(?,?)').run(id, JSON.stringify(publicData));
      }
      db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      return viewReport(db.prepare('SELECT * FROM reports WHERE id=?').get(id));
    },
    updateReport(id, data, userId) {
      db.exec('BEGIN');
      try {
      db.prepare('UPDATE reports SET kind=?,lon=?,lat=?,description=?,width_cm=? WHERE id=?').run(data.kind, ...data.coordinates, data.description, data.widthCm, id);
      db.prepare('INSERT INTO report_details VALUES(?,?) ON CONFLICT(report_id) DO UPDATE SET data=excluded.data').run(id, JSON.stringify(data));
      addReportEvent(db, id, userId, 'edit', 'Autor poprawił treść obserwacji.');
      db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      return viewReport(db.prepare('SELECT * FROM reports WHERE id=?').get(id));
    },
    confirmReport(id, userId, action, description) {
      addReportEvent(db, id, userId, action, description);
      return viewReport(db.prepare('SELECT * FROM reports WHERE id=?').get(id));
    },
    resolveReport(id) {
      const current = db.prepare('SELECT * FROM reports WHERE id=?').get(id);
      if (!current) return null;
      if (current.status !== 'active') return { ...viewReport(current), alreadyResolved: true };
      db.prepare("UPDATE reports SET status='resolved', resolved_at=? WHERE id=? AND status='active'")
        .run(new Date().toISOString(), id);
      const row = db.prepare('SELECT * FROM reports WHERE id=?').get(id);
      return row ? viewReport(row) : null;
    },
    close: () => db.close(),
  };
}
