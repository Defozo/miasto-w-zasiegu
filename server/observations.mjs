import { createHash, randomUUID } from 'node:crypto';
import { ApiError, coordinates, distance } from './routing.mjs';

export const OBSERVATION_TYPES = {
  rest_place: { label: 'Miejsce odpoczynku', validForMs: 7 * 86400000 },
  step_free_entrance: { label: 'Wejście bez schodów', validForMs: 86400000 },
  lift_working: { label: 'Winda zadziałała przy sprawdzeniu', validForMs: 2 * 3600000 },
};
const normalize = text => text.toLocaleLowerCase('pl').normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const fail = (status, code, message) => { throw new ApiError(status, code, message); };

export function ensureObservationSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS observations (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL,
    lon REAL NOT NULL, lat REAL NOT NULL, description TEXT NOT NULL,
    description_hash TEXT NOT NULL, observed_at TEXT NOT NULL, valid_until TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active', withdrawn_at TEXT,
    UNIQUE(user_id,description_hash));
    CREATE INDEX IF NOT EXISTS observations_public ON observations(status,valid_until,observed_at);
    CREATE INDEX IF NOT EXISTS observations_owner ON observations(user_id,observed_at);`);
}

export function observationView(row, user, now = Date.now()) {
  return { id: row.id, type: row.type, label: OBSERVATION_TYPES[row.type].label,
    coordinates: [row.lon, row.lat], description: row.description,
    observedAt: row.observed_at, validUntil: row.valid_until, status: row.status,
    withdrawnAt: row.withdrawn_at, stale: Date.parse(row.valid_until) <= now,
    isMine: Boolean(user && row.user_id === user.id), verification: 'unverified',
    affectsRouting: false, sourceLabel: 'Obserwacja społeczności · niezweryfikowana terenowo' };
}

export function registerObservationRoutes(app, context) {
  const { db, getUser, now = Date.now } = context;
  ensureObservationSchema(db);
  function requireUser(req) {
    const user = getUser(req);
    if (!user) fail(401, 'AUTH_REQUIRED', 'Zaloguj się, aby dodać własną obserwację.');
    if (req.body?.expectedUserId !== undefined && req.body.expectedUserId !== user.id)
      fail(409, 'ACCOUNT_CHANGED', 'Konto zmieniło się w innej karcie. Odśwież widok przed zapisem.');
    return user;
  }
  function limit(req, fallback = 100) {
    const raw = req.query.limit;
    if (raw === undefined) return fallback;
    if (typeof raw !== 'string' || !/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 200)
      fail(400, 'INVALID_INPUT', 'Limit obserwacji musi być liczbą całkowitą od 1 do 200.');
    return Number(raw);
  }
  app.get('/api/observations', (req, res) => {
    const max = limit(req), type = req.query.type;
    if (type !== undefined && (typeof type !== 'string' || !Object.hasOwn(OBSERVATION_TYPES, type))) fail(400, 'INVALID_INPUT', 'Nieznany rodzaj obserwacji.');
    let bbox;
    if (req.query.bbox !== undefined) {
      if (typeof req.query.bbox !== 'string') fail(400, 'INVALID_INPUT', 'Niepoprawny obszar wyszukiwania.');
      bbox = req.query.bbox.split(',').map(Number);
      if (bbox.length !== 4 || !bbox.every(Number.isFinite) || bbox[0] > bbox[2] || bbox[1] > bbox[3] || bbox[0] < -180 || bbox[2] > 180 || bbox[1] < -90 || bbox[3] > 90 || req.query.bbox.split(',').some(v => !v.trim()))
        fail(400, 'INVALID_INPUT', 'Obszar ma format zachód,południe,wschód,północ.');
    }
    const values = [new Date(now()).toISOString()];
    let filter = "status='active' AND valid_until>?";
    if (type !== undefined) { filter += ' AND type=?'; values.push(type); }
    if (bbox) { filter += ' AND lon>=? AND lat>=? AND lon<=? AND lat<=?'; values.push(...bbox); }
    const rows = db.prepare(`SELECT * FROM observations WHERE ${filter} ORDER BY observed_at DESC,id DESC LIMIT ?`).all(...values, max), user = getUser(req), timestamp = now();
    res.json({ observations: rows.map(row => observationView(row, user, timestamp)), limit: max,
      notice: 'Własne obserwacje społeczności, bez niezależnego potwierdzenia. Nie zmieniają wyznaczania tras ani potwierdzonej dostępności.' });
  });
  app.get('/api/observations/mine', (req, res) => {
    const user = requireUser(req), max = limit(req);
    const rows = db.prepare('SELECT * FROM observations WHERE user_id=? ORDER BY observed_at DESC,id DESC LIMIT ?').all(user.id, max);
    res.json({ observations: rows.map(row => observationView(row, user, now())), limit: max });
  });
  app.post('/api/observations', (req, res) => {
    const user = requireUser(req), data = req.body;
    if (!data || typeof data.type !== 'string' || !Object.hasOwn(OBSERVATION_TYPES, data.type) || typeof data.description !== 'string' || data.description.length > 800)
      fail(400, 'INVALID_INPUT', 'Wybierz rodzaj odkrycia i podaj opis do 800 znaków.');
    if (data.observedNow !== true) fail(400, 'OBSERVATION_CONFIRMATION_REQUIRED', 'Potwierdź własną, aktualną obserwację po zatrzymaniu się.');
    coordinates(data.coordinates);
    const description = data.description.trim(), words = normalize(description).split(' ').filter(Boolean);
    if (description.length < 35 || words.length < 6 || new Set(words).size < 5)
      fail(400, 'OBSERVATION_TOO_VAGUE', 'Opisz co sprawdzono i gdzie: minimum 35 znaków, 6 słów i 5 różnych słów.');
    const hash = createHash('sha256').update(normalize(description)).digest('hex');
    const timestamp = now(), dayAgo = new Date(timestamp - 86400000).toISOString();
    let saved;
    db.exec('BEGIN IMMEDIATE');
    try {
      const previous = db.prepare('SELECT * FROM observations WHERE user_id=?').all(user.id);
      if (previous.some(row => row.description_hash === hash || (row.type === data.type && row.observed_at > dayAgo && distance([row.lon, row.lat], data.coordinates) < 35)))
        fail(409, 'DUPLICATE_OBSERVATION', 'Ta sama treść lub ten rodzaj obserwacji w pobliżu jest już zapisany. Nie twórz kopii, także po wycofaniu wpisu.');
      if (previous.filter(row => row.observed_at > dayAgo).length >= 10)
        fail(429, 'OBSERVATION_DAILY_LIMIT', 'Limit prototypu wynosi 10 nowych obserwacji w ciągu 24 godzin.');
      if (previous.some(row => timestamp - Date.parse(row.observed_at) < 30000))
        fail(429, 'OBSERVATION_TOO_FAST', 'Daj sobie chwilę na sprawdzenie miejsca. Kolejny zapis będzie możliwy po krótkiej przerwie.');
      if (previous.length >= 1000 || db.prepare('SELECT count(*) AS total FROM observations').get().total >= 50000)
        fail(409, 'OBSERVATION_STORAGE_LIMIT', 'Osiągnięto limit obserwacji tego prototypu.');
      const id = randomUUID(), observedAt = new Date(timestamp).toISOString(), validUntil = new Date(timestamp + OBSERVATION_TYPES[data.type].validForMs).toISOString();
      db.prepare('INSERT INTO observations(id,user_id,type,lon,lat,description,description_hash,observed_at,valid_until) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(id, user.id, data.type, ...data.coordinates, description, hash, observedAt, validUntil);
      saved = db.prepare('SELECT * FROM observations WHERE id=?').get(id);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    const explorerReward = context.explorer?.awardObservation(user, saved);
    res.status(201).json({ ...observationView(saved, user, timestamp), explorerReward });
  });
  app.post('/api/observations/:id/withdraw', (req, res) => {
    const user = requireUser(req), row = db.prepare('SELECT * FROM observations WHERE id=?').get(req.params.id);
    if (!row) fail(404, 'OBSERVATION_NOT_FOUND', 'Nie znaleziono obserwacji.');
    if (row.user_id !== user.id) fail(403, 'OBSERVATION_NOT_OWNED', 'Możesz wycofać tylko własną obserwację.');
    if (row.status !== 'withdrawn') db.prepare("UPDATE observations SET status='withdrawn',withdrawn_at=? WHERE id=? AND user_id=?")
      .run(new Date(now()).toISOString(), row.id, user.id);
    res.json(observationView(db.prepare('SELECT * FROM observations WHERE id=?').get(row.id), user, now()));
  });
}

export default registerObservationRoutes;
