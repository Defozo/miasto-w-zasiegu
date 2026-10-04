import { randomUUID } from 'node:crypto';
import { ApiError, coordinates } from './routing.mjs';

const MAX_FAVORITES = 30;
const normalizeLabel = value => value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pl');

function text(value, title, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value))
    throw new ApiError(400, 'INVALID_FAVORITE', `${title}: wpisz od 1 do ${max} znaków, bez znaków sterujących.`);
  return value.trim();
}

function parseFavorite(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new ApiError(400, 'INVALID_FAVORITE', 'Podaj nazwę i wybierz miejsce do zapisania.');
  const label = text(body.label, 'Nazwa zapisu', 80), input = body.point;
  if (!input || typeof input !== 'object' || Array.isArray(input) || !['address', 'place', 'street'].includes(input.kind) ||
      !['address', 'approximate'].includes(input.precision))
    throw new ApiError(400, 'INVALID_FAVORITE', 'Wybierz poprawny adres lub miejsce na mapie.');
  const point = { id: text(input.id, 'Identyfikator miejsca', 160), label: text(input.label, 'Nazwa miejsca', 250),
    coordinates: [...coordinates(input.coordinates)], kind: input.kind, precision: input.precision };
  for (const [key, title, max] of [['sourceLabel', 'Opis źródła', 250], ['coordinateKind', 'Opis położenia', 80]])
    if (input[key] !== undefined) point[key] = text(input[key], title, max);
  if (input.sourceUrl !== undefined) {
    const value = text(input.sourceUrl, 'Adres źródła', 2048);
    let url;
    try { url = new URL(value); } catch { /* Validation below gives a bounded public error. */ }
    if (!url || url.protocol !== 'https:' || url.username || url.password)
      throw new ApiError(400, 'INVALID_FAVORITE', 'Źródło powinno być poprawnym adresem HTTPS bez danych logowania.');
    point.sourceUrl = url.href;
  }
  return { label, point, dedupeKey: JSON.stringify([normalizeLabel(label), ...point.coordinates.map(value => value.toFixed(6))]) };
}

function view(row) {
  return { id: row.id, label: row.label, point: JSON.parse(row.point_json), createdAt: row.created_at, updatedAt: row.updated_at };
}

export function registerFavorites(app, { db, getUser }) {
  db.exec(`CREATE TABLE IF NOT EXISTS favorites (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, label TEXT NOT NULL, point_json TEXT NOT NULL,
    dedupe_key TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(user_id, dedupe_key));
    CREATE INDEX IF NOT EXISTS favorites_user_time ON favorites(user_id, created_at);`);

  function owner(req) {
    const user = getUser(req);
    if (req.method !== 'GET' && req.body && Object.hasOwn(req.body, 'expectedUserId') && req.body.expectedUserId !== (user?.id ?? null))
      throw new ApiError(409, 'ACCOUNT_CHANGED', 'Konto zmieniło się w innej karcie. Odśwież widok i spróbuj ponownie.');
    if (!user) throw new ApiError(401, 'AUTH_REQUIRED', 'Zaloguj się, aby zapisać miejsca na koncie.');
    return user.id;
  }

  app.get('/api/favorites', (req, res) => {
    const userId = owner(req);
    res.set('Cache-Control', 'no-store').json({ favorites: db.prepare('SELECT * FROM favorites WHERE user_id=? ORDER BY created_at,id').all(userId).map(view) });
  });

  app.post('/api/favorites', (req, res) => {
    const userId = owner(req), data = parseFavorite(req.body);
    let favorite, duplicate = false;
    db.exec('BEGIN IMMEDIATE');
    try {
      const existing = db.prepare('SELECT * FROM favorites WHERE user_id=? AND dedupe_key=?').get(userId, data.dedupeKey);
      if (existing) { favorite = view(existing); duplicate = true; }
      else {
        if (db.prepare('SELECT COUNT(*) AS n FROM favorites WHERE user_id=?').get(userId).n >= MAX_FAVORITES)
          throw new ApiError(409, 'FAVORITE_LIMIT', 'Możesz zapisać maksymalnie 30 miejsc. Usuń niepotrzebny zapis, aby dodać następny.');
        const id = randomUUID(), timestamp = new Date().toISOString();
        db.prepare('INSERT INTO favorites(id,user_id,label,point_json,dedupe_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
          .run(id, userId, data.label, JSON.stringify(data.point), data.dedupeKey, timestamp, timestamp);
        favorite = view(db.prepare('SELECT * FROM favorites WHERE id=? AND user_id=?').get(id, userId));
      }
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    res.set('Cache-Control', 'no-store').status(duplicate ? 200 : 201).json(favorite);
  });

  app.delete('/api/favorites/:id', (req, res) => {
    const userId = owner(req);
    const deleted = db.prepare('DELETE FROM favorites WHERE id=? AND user_id=?').run(req.params.id, userId);
    if (!deleted.changes) throw new ApiError(404, 'NOT_FOUND', 'Nie znaleziono zapisanego miejsca.');
    res.set('Cache-Control', 'no-store').json({ ok: true });
  });
}
