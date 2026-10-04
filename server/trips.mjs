import { randomUUID } from 'node:crypto';
import { ApiError } from './routing.mjs';
import { requireUser, validateProfile } from './auth.mjs';

const MODEL = 'personal-median-ewma-v1';
const profileKey = profile => JSON.stringify(validateProfile(profile));
const median = values => { const sorted = [...values].sort((a, b) => a - b), i = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[i] : (sorted[i-1] + sorted[i]) / 2; };
const emptyLearning = () => ({ sampleCount: 0, candidateCount: 0, ready: false, secondsPerMeter: null, durationModel: 'ors',
  minimumSamples: 3, profile: null, quality: 'Czasy zadeklarowane przez użytkownika; bez niezależnego pomiaru i bez uczenia przejezdności.' });

export function createTrips(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS trips (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, route_id TEXT, distance_m REAL NOT NULL, duration_s REAL NOT NULL,
    completed INTEGER NOT NULL, feedback TEXT NOT NULL, profile_json TEXT NOT NULL, profile_key TEXT NOT NULL,
    eligible INTEGER NOT NULL, quality_json TEXT NOT NULL, learning_excluded INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS trips_user_time ON trips(user_id, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS trips_once_per_route ON trips(user_id, route_id) WHERE route_id IS NOT NULL;`);
  function tripView(row) {
    return { id: row.id, routeId: row.route_id, distanceM: row.distance_m, durationS: row.duration_s,
      completed: Boolean(row.completed), feedback: row.feedback, profile: JSON.parse(row.profile_json), consent: true,
      eligibleForLearning: Boolean(row.eligible && !row.learning_excluded),
      qualityReasons: [...JSON.parse(row.quality_json), ...(row.learning_excluded ? ['learning_reset'] : [])], createdAt: row.created_at };
  }
  function chosenProfile(userId) {
    const user = db.prepare('SELECT profile_json FROM users WHERE id=?').get(userId);
    if (user?.profile_json) return JSON.parse(user.profile_json);
    const latest = db.prepare('SELECT profile_json FROM trips WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1').get(userId);
    return latest ? JSON.parse(latest.profile_json) : null;
  }
  function learning(userId, profile = chosenProfile(userId)) {
    const empty = emptyLearning();
    if (!profile) return empty;
    const rows = db.prepare('SELECT duration_s,distance_m,created_at FROM trips WHERE user_id=? AND profile_key=? AND eligible=1 AND learning_excluded=0 ORDER BY created_at DESC,rowid DESC LIMIT 20')
      .all(userId, profileKey(profile)).reverse();
    if (!rows.length) return { ...empty, profile };
    const ratios = rows.map(r => r.duration_s / r.distance_m), mid = median(ratios);
    const mad = median(ratios.map(v => Math.abs(v - mid)));
    const accepted = ratios.filter(v => Math.abs(v - mid) <= Math.max(3 * mad, 0.5 * mid));
    let ewma = accepted[0] ?? mid;
    for (const value of accepted.slice(1)) ewma = 0.25 * value + 0.75 * ewma;
    const ready = accepted.length >= 3;
    return { ...empty, profile, sampleCount: accepted.length, candidateCount: ratios.length, ready,
      secondsPerMeter: ready ? Math.round(ewma * 10000) / 10000 : null, durationModel: ready ? MODEL : 'ors',
      outliersExcluded: ratios.length - accepted.length, updatedAt: rows.at(-1).created_at };
  }
  function personalize(route, user, requestedMobility) {
    route.source.durationModel = 'ors';
    route.source.baseDurationS = route.durationS;
    if (!user) return route;
    const known = chosenProfile(user.id);
    if (!known && !requestedMobility) { route.source.calibrationSamples = 0; return route; }
    const p = route.source.profileApplied;
    const profile = validateProfile({ mobility: requestedMobility ?? known.mobility, widthCm: p.widthCm === null ? '' : String(p.widthCm),
      maxIncline: String(p.maxIncline), maxKerbCm: String(p.maxKerbCm), avoidUnpaved: p.avoidUnpaved });
    const model = learning(user.id, profile);
    route.source.calibrationSamples = model.sampleCount;
    if (model.ready) {
      route.durationS = Math.round(route.distanceM * model.secondsPerMeter);
      route.source.durationModel = MODEL;
      route.source.secondsPerMeter = model.secondsPerMeter;
      route.warnings.push(`Czas dostosowano do ${model.sampleCount} Twoich przejazdów z takim samym profilem. To szacunek, nie ocena dostępności ani bieżących warunków.`);
    }
    return route;
  }
  function registerRoutes(app) {
    app.post('/api/trips', (req, res) => {
      const user = requireUser(req), body = req.body;
      if (!body || body.consent !== true) throw new ApiError(400, 'CONSENT_REQUIRED', 'Zapis przejazdu wymaga jawnej zgody.');
      if (typeof body.distanceM !== 'number' || !Number.isFinite(body.distanceM) || body.distanceM < 0 || body.distanceM > 100000 ||
          typeof body.durationS !== 'number' || !Number.isFinite(body.durationS) || body.durationS < 0 || body.durationS > 86400 ||
          typeof body.completed !== 'boolean' || !['passable', 'difficult', 'blocked'].includes(body.feedback))
        throw new ApiError(400, 'INVALID_TRIP', 'Niepoprawny dystans, czas lub wynik przejazdu.');
      if (body.routeId !== undefined && (typeof body.routeId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(body.routeId)))
        throw new ApiError(400, 'INVALID_TRIP', 'Niepoprawny identyfikator trasy.');
      if (db.prepare('SELECT COUNT(*) AS n FROM trips WHERE user_id=?').get(user.id).n >= 2000)
        throw new ApiError(409, 'TRIP_LIMIT', 'Osiągnięto limit historii. Możesz usunąć historię w ustawieniach.');
      const profile = validateProfile(body.profile), reasons = [];
      if (!body.completed) reasons.push('incomplete');
      if (body.feedback !== 'passable') reasons.push('non_passable_feedback');
      if (body.distanceM < 100 || body.distanceM > 20000) reasons.push('distance_outside_quality_range');
      if (body.durationS < 60 || body.durationS > 14400) reasons.push('duration_outside_quality_range');
      const ratio = body.distanceM > 0 ? body.durationS / body.distanceM : Infinity;
      if (ratio < 0.25 || ratio > 10) reasons.push('speed_outside_quality_range');
      const id = randomUUID();
      try {
        db.prepare('INSERT INTO trips(id,user_id,route_id,distance_m,duration_s,completed,feedback,profile_json,profile_key,eligible,quality_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(id, user.id, body.routeId ?? null, body.distanceM, body.durationS, body.completed ? 1 : 0, body.feedback,
            JSON.stringify(profile), profileKey(profile), reasons.length ? 0 : 1, JSON.stringify(reasons), new Date().toISOString());
      } catch (error) {
        if (body.routeId && db.prepare('SELECT 1 FROM trips WHERE user_id=? AND route_id=?').get(user.id, body.routeId))
          throw new ApiError(409, 'TRIP_ALREADY_RECORDED', 'Ten przejazd jest już zapisany.');
        throw error;
      }
      res.status(201).json({ trip: tripView(db.prepare('SELECT * FROM trips WHERE id=?').get(id)), learning: learning(user.id, profile) });
    });
    app.get('/api/trips/me', (req, res) => {
      const user = requireUser(req);
      res.json({ trips: db.prepare('SELECT * FROM trips WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 100').all(user.id).map(tripView),
        total: db.prepare('SELECT COUNT(*) AS n FROM trips WHERE user_id=?').get(user.id).n });
    });
    app.delete('/api/trips/me', (req, res) => {
      const user = requireUser(req), result = db.prepare('DELETE FROM trips WHERE user_id=?').run(user.id);
      res.json({ deleted: result.changes, learning: learning(user.id) });
    });
    app.get('/api/learning/me', (req, res) => res.json(learning(requireUser(req).id)));
    app.delete('/api/learning/me', (req, res) => {
      const user = requireUser(req), result = db.prepare('UPDATE trips SET learning_excluded=1 WHERE user_id=? AND learning_excluded=0').run(user.id);
      res.json({ excluded: result.changes, learning: learning(user.id) });
    });
  }
  return { registerRoutes, learning, personalize };
}
