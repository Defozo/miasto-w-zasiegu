// Historical local authentication fixture. Never imported by the application server.
import { createHash, randomBytes, randomUUID, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { ApiError } from '../../server/routing.mjs';

const scrypt = promisify(nodeScrypt);
const COOKIE = 'przejscie_session';
const SESSION_MS = 7 * 24 * 3600000;
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const hashToken = token => createHash('sha256').update(token).digest('hex');
const userView = row => row ? { id: row.id, email: row.email, displayName: row.display_name } : null;

export function validateProfile(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !['manual', 'power', 'stroller', 'walking'].includes(raw.mobility) || typeof raw.avoidUnpaved !== 'boolean')
    throw new ApiError(400, 'INVALID_PROFILE', 'Niepoprawny profil mobilności.');
  function field(key, min, max, optional = false, integer = false) {
    const label = { widthCm: 'Szerokość wózka w cm', maxIncline: 'Maksymalne nachylenie w %', maxKerbCm: 'Wysokość krawężnika w cm' }[key];
    if (typeof raw[key] !== 'string' || raw[key].length > 20) throw new ApiError(400, 'INVALID_PROFILE', `${label}: uzupełnij poprawnie pole liczbowe.`);
    const text = raw[key].trim().replace(',', '.');
    if (optional && text === '') return '';
    const value = Number(text);
    if (!/^\d+(\.\d+)?$/.test(text) || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value)))
      throw new ApiError(400, 'INVALID_PROFILE', `${label}: podaj wartość od ${min} do ${max}${integer ? ' jako liczbę całkowitą' : ''}.`);
    return String(value);
  }
  return { mobility: raw.mobility, widthCm: field('widthCm', 30, 200, true), maxIncline: field('maxIncline', 0, 15, false, true),
    maxKerbCm: field('maxKerbCm', 0, 20), avoidUnpaved: raw.avoidUnpaved };
}

export function getUser(req) { return req.app.locals.context?.auth.getUser(req) ?? null; }
export function requireUser(req) {
  const user = getUser(req);
  if (!user) throw new ApiError(401, 'AUTH_REQUIRED', 'Zaloguj się, aby skorzystać z tej funkcji.');
  return user;
}

export function createAuth(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, password_hash TEXT NOT NULL,
    profile_json TEXT, profile_version INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);`);
  const attempts = new Map();
  let hashing = 0;
  function rateLimit(req, bucket, limit, windowMs) {
    const now = Date.now(), key = `${bucket}:${req.ip ?? req.socket?.remoteAddress ?? 'unknown'}`;
    if (attempts.size > 5000) for (const [k, v] of attempts) if (v.until <= now) attempts.delete(k);
    if (attempts.size > 10000) throw new ApiError(429, 'AUTH_BUSY', 'Spróbuj zalogować się za kilka minut.');
    const entry = attempts.get(key);
    if (!entry || entry.until <= now) attempts.set(key, { count: 1, until: now + windowMs });
    else { entry.count++; if (entry.count > limit) throw new ApiError(429, 'AUTH_RATE_LIMIT', 'Zbyt wiele prób. Spróbuj ponownie później.'); }
  }
  async function derive(password, salt) {
    if (hashing >= 8) throw new ApiError(429, 'AUTH_BUSY', 'Trwa obsługa innych logowań. Spróbuj za chwilę.');
    hashing++;
    try { return await scrypt(password, salt, 64, SCRYPT); } finally { hashing--; }
  }
  function credentials(raw, register = false) {
    if (!raw || typeof raw.email !== 'string' || raw.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.email.trim()))
      throw new ApiError(400, 'INVALID_EMAIL', 'Podaj poprawny adres e-mail.');
    if (typeof raw.password !== 'string' || raw.password.length > 128 || raw.password.length < (register ? 12 : 1))
      throw new ApiError(400, 'INVALID_PASSWORD', register ? 'Hasło powinno mieć od 12 do 128 znaków.' : 'Podaj hasło.');
    return { email: raw.email.trim().toLocaleLowerCase('en-US'), password: raw.password };
  }
  function tokenFrom(req) {
    if (req.headers.authorization !== undefined) {
      const match = /^Bearer ([a-f0-9]{64})$/i.exec(req.headers.authorization);
      return match?.[1] ?? null;
    }
    const entry = (req.headers.cookie ?? '').split(';').map(v => v.trim()).find(v => v.startsWith(`${COOKIE}=`));
    const token = entry?.slice(COOKIE.length + 1);
    return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
  }
  function currentUser(req) {
    const token = tokenFrom(req);
    if (!token) return null;
    return userView(db.prepare('SELECT u.id,u.email,u.display_name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?')
      .get(hashToken(token), new Date().toISOString()));
  }
  function snapshot(user) {
    if (!user) return { user: null, profile: null, profileVersion: 0 };
    const row = db.prepare('SELECT profile_json,profile_version FROM users WHERE id=?').get(user.id);
    return { user, profile: row.profile_json ? JSON.parse(row.profile_json) : null, profileVersion: row.profile_version };
  }
  function createSession(user, req, res) {
    const token = randomBytes(32).toString('hex'), now = new Date();
    db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now.toISOString());
    // Bound active sessions per account; keep the newest ten, including this one.
    db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash NOT IN (SELECT token_hash FROM sessions WHERE user_id=? ORDER BY created_at DESC LIMIT 9)').run(user.id, user.id);
    db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)')
      .run(hashToken(token), user.id, new Date(now.getTime() + SESSION_MS).toISOString(), now.toISOString());
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: req.secure, path: '/api', maxAge: SESSION_MS });
    return { ...snapshot(user), token };
  }
  function registerRoutes(app) {
    app.get('/api/auth/config', (_req, res) => res.json({ provider: 'local-test', configured: false, publishableKey: null }));
    app.post('/api/auth/register', async (req, res) => {
      rateLimit(req, 'register', 8, 3600000);
      const { email, password } = credentials(req.body, true);
      const displayName = req.body.displayName;
      if (typeof displayName !== 'string' || displayName.trim().length < 2 || displayName.trim().length > 60 || /[\u0000-\u001f\u007f]/.test(displayName))
        throw new ApiError(400, 'INVALID_NAME', 'Nazwa powinna mieć od 2 do 60 znaków.');
      const salt = randomBytes(16).toString('hex'), key = await derive(password, salt);
      const id = randomUUID();
      try {
        db.prepare('INSERT INTO users(id,email,display_name,password_hash,created_at) VALUES(?,?,?,?,?)')
          .run(id, email, displayName.trim(), `scrypt$32768$8$1$${salt}$${key.toString('hex')}`, new Date().toISOString());
      } catch (error) {
        if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) throw new ApiError(409, 'EMAIL_EXISTS', 'Konto z tym adresem już istnieje.');
        throw error;
      }
      res.status(201).json(createSession({ id, email, displayName: displayName.trim() }, req, res));
    });
    app.post('/api/auth/login', async (req, res) => {
      rateLimit(req, 'login', 12, 15 * 60000);
      const { email, password } = credentials(req.body);
      const row = db.prepare('SELECT * FROM users WHERE email=?').get(email);
      const stored = row?.password_hash?.split('$');
      const salt = stored?.[4] ?? '00000000000000000000000000000000';
      const actual = await derive(password, salt), expected = Buffer.from(stored?.[5] ?? '00'.repeat(64), 'hex');
      if (!row || expected.length !== actual.length || !timingSafeEqual(actual, expected))
        throw new ApiError(401, 'INVALID_CREDENTIALS', 'Niepoprawny e-mail lub hasło.');
      res.json(createSession(userView(row), req, res));
    });
    app.post('/api/auth/logout', (req, res) => {
      const token = tokenFrom(req);
      if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token));
      res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'strict', secure: req.secure, path: '/api' });
      res.json({ ok: true });
    });
    app.get('/api/auth/me', (req, res) => res.json(snapshot(currentUser(req))));
    app.put('/api/profile', (req, res) => {
      const user = requireUser(req), profile = validateProfile(req.body?.profile), version = req.body?.expectedVersion;
      if (app.locals.context?.mobilityPresets) return res.json(app.locals.context.mobilityPresets.saveLegacy(user.id, profile, version));
      if (!Number.isSafeInteger(version) || version < 0) throw new ApiError(400, 'INVALID_VERSION', 'Podaj poprawną wersję profilu.');
      const result = db.prepare('UPDATE users SET profile_json=?,profile_version=profile_version+1 WHERE id=? AND profile_version=?')
        .run(JSON.stringify(profile), user.id, version);
      const current = snapshot(user);
      if (!result.changes) throw new ApiError(409, 'PROFILE_CONFLICT', 'Profil zmienił się na innym urządzeniu. Wczytaj aktualną wersję.',
        { profile: current.profile, profileVersion: current.profileVersion });
      res.json({ profile: current.profile, profileVersion: current.profileVersion });
    });
  }
  return { getUser: currentUser, snapshot, registerRoutes };
}
