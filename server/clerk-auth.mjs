import { createClerkClient } from '@clerk/backend';
import { ApiError } from './routing.mjs';

const requestIdentity = Symbol('clerkIdentity');
const LOCAL_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173'];
const SYNC_MS = 5 * 60_000;
const userView = row => row ? { id: row.id, email: row.clerk_email ?? '', displayName: row.display_name } : null;

function validKeyPair(publishableKey, secretKey) {
  const key = /^pk_(test|live)_([A-Za-z0-9+/=]+)$/.exec(publishableKey);
  if (!key || !secretKey.startsWith(`sk_${key[1]}_`)) return false;
  const domain = Buffer.from(key[2], 'base64').toString('utf8');
  return /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z0-9-]+\$$/i.test(domain);
}

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

function allowedOrigins(value) {
  const origins = typeof value === 'string' ? value.split(',').map(s => s.trim()).filter(Boolean) : value;
  if (!Array.isArray(origins) || !origins.length) throw new Error('CLERK_AUTHORIZED_PARTIES must contain at least one origin.');
  return [...new Set(origins.map(origin => {
    const url = new URL(origin);
    if (!['https:', 'http:'].includes(url.protocol) || url.origin !== origin ||
        (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
      throw new Error('CLERK_AUTHORIZED_PARTIES must contain exact HTTPS origins (HTTP is allowed on loopback only).');
    return origin;
  }))];
}

export function createAuth(db, options = {}) {
  const publishableKey = options.publishableKey ?? process.env.PRZEJSCIE_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY ?? '';
  const secretKey = options.secretKey ?? process.env.PRZEJSCIE_CLERK_SECRET_KEY ?? process.env.CLERK_SECRET_KEY ?? '';
  const jwtKey = options.jwtKey ?? process.env.CLERK_JWT_KEY;
  const authorizedParties = allowedOrigins(options.authorizedParties ?? process.env.CLERK_AUTHORIZED_PARTIES ?? LOCAL_ORIGINS);
  const configured = validKeyPair(publishableKey, secretKey);
  const client = options.client ?? (configured ? createClerkClient({ publishableKey, secretKey, telemetry: { disabled: true } }) : null);

  // Legacy email addresses were unverified. Never link them to OAuth accounts.
  // Keep their rows and all existing foreign identifiers intact.
  db.exec(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, password_hash TEXT NOT NULL,
    profile_json TEXT, profile_version INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);`);
  const columns = new Set(db.prepare('PRAGMA table_info(users)').all().map(row => row.name));
  for (const [name, type] of [['clerk_user_id', 'TEXT'], ['clerk_email', 'TEXT'], ['clerk_synced_at', 'INTEGER']]) {
    if (!columns.has(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${type}`);
  }
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS users_clerk_id ON users(clerk_user_id);
    CREATE TABLE IF NOT EXISTS revoked_clerk_sessions (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);`);

  const pendingUsers = new Map();
  async function syncUser(subject) {
    const existing = db.prepare('SELECT * FROM users WHERE clerk_user_id=?').get(subject);
    if (existing && existing.clerk_synced_at > Date.now() - SYNC_MS) return userView(existing);
    if (pendingUsers.has(subject)) return pendingUsers.get(subject);
    const pending = (async () => {
      let remote;
      try { remote = await client.users.getUser(subject); }
      catch { throw new ApiError(503, 'AUTH_UNAVAILABLE', 'Nie udało się potwierdzić konta. Spróbuj ponownie.'); }
      if (remote.id !== subject || remote.banned || remote.locked)
        throw new ApiError(401, 'AUTH_REQUIRED', 'To konto nie jest obecnie dostępne.');
      const primary = remote.emailAddresses?.find(email => email.id === remote.primaryEmailAddressId && email.verification?.status === 'verified');
      const email = primary?.emailAddress ?? '';
      const name = ([remote.firstName, remote.lastName].filter(Boolean).join(' ') || remote.username || 'Użytkownik').slice(0, 120);
      const id = existing?.id ?? `clerk:${subject}`;
      // The old NOT NULL/UNIQUE email column becomes an internal login identifier.
      // Only clerk_email is returned to clients. No password is stored for Clerk users.
      db.prepare(`INSERT INTO users(id,email,display_name,password_hash,created_at,clerk_user_id,clerk_email,clerk_synced_at)
        VALUES(?,?,?,'',?,?,?,?) ON CONFLICT(clerk_user_id) DO UPDATE SET
        display_name=excluded.display_name,clerk_email=excluded.clerk_email,clerk_synced_at=excluded.clerk_synced_at`)
        .run(id, `clerk:${subject}`, name, new Date().toISOString(), subject, email, Date.now());
      return userView(db.prepare('SELECT * FROM users WHERE clerk_user_id=?').get(subject));
    })();
    pendingUsers.set(subject, pending);
    try { return await pending; } finally { pendingUsers.delete(subject); }
  }

  async function middleware(req, _res, next) {
    req[requestIdentity] = null;
    // Explicit Bearer only: stale cookies and invalid credentials must not turn
    // into an authenticated request or silently fall back to an anonymous write.
    const header = req.headers.authorization;
    if (header === undefined) return next();
    try {
      if (typeof header !== 'string' || !/^Bearer [^\s,]+$/i.test(header) || header.length > 16384)
        throw new ApiError(401, 'AUTH_REQUIRED', 'Sesja jest niepoprawna. Zaloguj się ponownie.');
      if (!configured || !client) throw new ApiError(503, 'AUTH_NOT_CONFIGURED', 'Logowanie jest obecnie niedostępne.');
      let state;
      try {
        const request = new Request(`${req.protocol}://${req.get('host')}${req.originalUrl}`, { headers: { Authorization: header } });
        state = await client.authenticateRequest(request, { jwtKey, acceptsToken: 'session_token' });
      } catch { throw new ApiError(503, 'AUTH_UNAVAILABLE', 'Nie udało się sprawdzić sesji. Spróbuj ponownie.'); }
      const identity = state.isAuthenticated ? state.toAuth() : null;
      if (!identity?.userId || !identity.sessionId || identity.tokenType !== 'session_token')
        throw new ApiError(401, 'AUTH_REQUIRED', 'Sesja wygasła lub jest niepoprawna. Zaloguj się ponownie.');
      // Check only the verified claims. Native SDK tokens omit azp; browser tokens
      // must match the same exact origin allowlist as Clerk's authorizedParties option.
      const azp = identity.sessionClaims?.azp;
      if (azp !== undefined && !authorizedParties.includes(azp))
        throw new ApiError(401, 'AUTH_REQUIRED', 'Sesja pochodzi z niedozwolonej aplikacji.');
      if (db.prepare('SELECT 1 FROM revoked_clerk_sessions WHERE id=? AND expires_at>?').get(identity.sessionId, Date.now()))
        throw new ApiError(401, 'AUTH_REQUIRED', 'Ta sesja została wylogowana.');
      req[requestIdentity] = { ...identity, user: await syncUser(identity.userId) };
      next();
    } catch (error) { next(error); }
  }

  function currentUser(req) { return req[requestIdentity]?.user ?? null; }
  function snapshot(user) {
    if (!user) return { user: null, profile: null, profileVersion: 0 };
    const row = db.prepare('SELECT profile_json,profile_version FROM users WHERE id=?').get(user.id);
    return { user, profile: row?.profile_json ? JSON.parse(row.profile_json) : null, profileVersion: row?.profile_version ?? 0 };
  }
  function registerRoutes(app) {
    app.get('/api/auth/config', (_req, res) => res.json({ provider: 'clerk', configured, publishableKey: configured ? publishableKey : null }));
    app.post(['/api/auth/register', '/api/auth/login'], () => {
      throw new ApiError(410, 'USE_CLERK', 'Logowanie i tworzenie konta odbywa się przez Clerk. Otwórz aktualny ekran konta.');
    });
    app.post('/api/auth/logout', async (req, res) => {
      const identity = req[requestIdentity];
      if (identity) {
        try { await client.sessions.revokeSession(identity.sessionId); }
        catch { throw new ApiError(503, 'AUTH_UNAVAILABLE', 'Nie udało się zakończyć sesji. Spróbuj ponownie.'); }
        db.prepare('DELETE FROM revoked_clerk_sessions WHERE expires_at<=?').run(Date.now());
        // Reject the current JWT immediately, even before its short expiry.
        const until = Math.max(Date.now() + 120_000, Number(identity.sessionClaims?.exp ?? 0) * 1000);
        db.prepare('INSERT OR REPLACE INTO revoked_clerk_sessions(id,expires_at) VALUES(?,?)').run(identity.sessionId, until);
      }
      res.clearCookie('przejscie_session', { httpOnly: true, sameSite: 'strict', secure: req.secure, path: '/api' });
      res.json({ ok: true });
    });
    app.get('/api/auth/me', (req, res) => res.json(snapshot(currentUser(req))));
    app.put('/api/profile', (req, res) => {
      const user = requireUser(req), profile = validateProfile(req.body?.profile), version = req.body?.expectedVersion;
      if (app.locals.context.mobilityPresets) return res.json(app.locals.context.mobilityPresets.saveLegacy(user.id, profile, version));
      if (!Number.isSafeInteger(version) || version < 0) throw new ApiError(400, 'INVALID_VERSION', 'Podaj poprawną wersję profilu.');
      const result = db.prepare('UPDATE users SET profile_json=?,profile_version=profile_version+1 WHERE id=? AND profile_version=?')
        .run(JSON.stringify(profile), user.id, version);
      const current = snapshot(user);
      if (!result.changes) throw new ApiError(409, 'PROFILE_CONFLICT', 'Profil zmienił się na innym urządzeniu. Wczytaj aktualną wersję.',
        { profile: current.profile, profileVersion: current.profileVersion });
      res.json({ profile: current.profile, profileVersion: current.profileVersion });
    });
  }
  return { getUser: currentUser, snapshot, middleware, registerRoutes };
}
