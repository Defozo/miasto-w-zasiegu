import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { parse } from 'parse5';
import { requireUser } from './auth.mjs';
import { ApiError } from './routing.mjs';
import { fetchSiteHtml, normalizeSiteUrl } from './safe-site-fetch.mjs';

const CHALLENGE_MS = 24 * 3600000;
const VERIFICATION_MS = 30 * 24 * 3600000;
const META_NAME = 'przejscie-site-verification';
const digest = value => createHash('sha256').update(value).digest();

export function hasVerificationMeta(html, tokenHash) {
  const document = parse(html, { scriptingEnabled: true });
  const root = document.childNodes.find(node => node.tagName === 'html');
  const head = root?.childNodes.find(node => node.tagName === 'head');
  if (!head || typeof tokenHash !== 'string' || !/^[a-f0-9]{64}$/.test(tokenHash)) return false;
  const expected = Buffer.from(tokenHash, 'hex');
  return head.childNodes.some(node => {
    if (node.tagName !== 'meta') return false;
    const attributes = Object.fromEntries(node.attrs.map(attribute => [attribute.name, attribute.value]));
    return attributes.name === META_NAME && /^[a-f0-9]{64}$/.test(attributes.content ?? '') &&
      timingSafeEqual(expected, digest(attributes.content));
  });
}

export function registerSiteVerificationRoutes(app, context, options = {}) {
  const { db } = context;
  const clock = options.now ?? Date.now;
  const now = () => new Date(clock()).getTime();
  db.exec(`CREATE TABLE IF NOT EXISTS site_verifications (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, host TEXT NOT NULL, token_hash TEXT NOT NULL,
    challenge_expires_at TEXT NOT NULL, challenge_consumed_at TEXT, verified_at TEXT, expires_at TEXT,
    created_at TEXT NOT NULL, last_checked_at TEXT, last_error_code TEXT,
    UNIQUE(user_id,host));
    CREATE INDEX IF NOT EXISTS site_verifications_user ON site_verifications(user_id);`);
  const limits = new Map(), checking = new Set();
  let running = 0;

  function currentUser(req) {
    const user = requireUser(req);
    const expected = req.method === 'GET' ? req.query.expectedUserId : req.body?.expectedUserId;
    if (expected !== undefined && expected !== user.id)
      throw new ApiError(409, 'ACCOUNT_CHANGED', 'Konto zmieniło się w innej karcie. Odśwież widok i spróbuj ponownie.');
    return user;
  }
  function limit(key, count, windowMs) {
    const time = now();
    if (limits.size > 2000) for (const [entry, value] of limits) if (value.until <= time) limits.delete(entry);
    if (limits.size > 10000) throw new ApiError(429, 'SITE_BUSY', 'Sprawdzanie stron jest obecnie zajęte. Spróbuj później.');
    let entry = limits.get(key);
    if (!entry || entry.until <= time) { entry = { count: 0, until: time + windowMs }; limits.set(key, entry); }
    if (++entry.count > count) throw new ApiError(429, 'SITE_RATE_LIMIT', 'Zbyt wiele prób potwierdzenia strony. Spróbuj później.');
  }
  function view(row) {
    const time = now(), verified = row.expires_at && Date.parse(row.expires_at) > time;
    return { id: row.id, host: row.host, verificationUrl: `https://${row.host}/`,
      status: verified ? 'verified' : !row.challenge_consumed_at && Date.parse(row.challenge_expires_at) > time ? 'pending' : 'expired',
      challengeExpiresAt: row.challenge_expires_at, verifiedAt: row.verified_at, expiresAt: row.expires_at,
      lastCheckedAt: row.last_checked_at, lastErrorCode: row.last_error_code };
  }
  function getBadge(authorId, websiteUrlAtPublication) {
    if (typeof authorId !== 'string') return null;
    let host;
    try { ({ host } = normalizeSiteUrl(websiteUrlAtPublication, { allowQuery: true })); } catch { return null; }
    const row = db.prepare('SELECT host,verified_at,expires_at FROM site_verifications WHERE user_id=? AND host=?').get(authorId, host);
    if (!row?.verified_at || !Number.isFinite(Date.parse(row.verified_at)) || !(Date.parse(row.expires_at) > now())) return null;
    return { host: row.host, verifiedAt: row.verified_at, expiresAt: row.expires_at };
  }

  app.get('/api/site-verifications', (req, res) => {
    const user = currentUser(req);
    const rows = db.prepare('SELECT * FROM site_verifications WHERE user_id=? ORDER BY host').all(user.id);
    res.set('Cache-Control', 'no-store').json({ verifications: rows.map(view) });
  });

  app.post('/api/site-verifications', (req, res) => {
    const user = currentUser(req), { host, verificationUrl } = normalizeSiteUrl(req.body?.websiteUrl);
    limit(`create:user:${user.id}`, 10, 3600000);
    limit(`create:ip:${req.ip ?? 'unknown'}`, 30, 3600000);
    const existing = db.prepare('SELECT id FROM site_verifications WHERE user_id=? AND host=?').get(user.id, host);
    if (!existing && db.prepare('SELECT COUNT(*) AS n FROM site_verifications WHERE user_id=?').get(user.id).n >= 20)
      throw new ApiError(409, 'SITE_LIMIT', 'Możesz potwierdzić maksymalnie 20 domen na jednym koncie.');
    const id = randomUUID(), token = randomBytes(32).toString('hex'), time = now();
    db.prepare(`INSERT INTO site_verifications(id,user_id,host,token_hash,challenge_expires_at,created_at)
      VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,host) DO UPDATE SET id=excluded.id, token_hash=excluded.token_hash,
      challenge_expires_at=excluded.challenge_expires_at,challenge_consumed_at=NULL,created_at=excluded.created_at,
      last_checked_at=NULL,last_error_code=NULL`)
      .run(id, user.id, host, digest(token).toString('hex'), new Date(time + CHALLENGE_MS).toISOString(), new Date(time).toISOString());
    const row = db.prepare('SELECT * FROM site_verifications WHERE id=?').get(id);
    res.set('Cache-Control', 'no-store').status(201).json({ verification: { ...view(row), verificationUrl },
      metaTag: `<meta name="${META_NAME}" content="${token}">` });
  });

  app.post('/api/site-verifications/:id/check', async (req, res) => {
    const user = currentUser(req);
    const row = db.prepare('SELECT * FROM site_verifications WHERE id=? AND user_id=?').get(req.params.id, user.id);
    if (!row) throw new ApiError(404, 'SITE_CHALLENGE_NOT_FOUND', 'Nie znaleziono aktualnego potwierdzenia strony. Utwórz nowy znacznik.');
    if (row.challenge_consumed_at) {
      // Retrying a successful request is safe, but never extends its validity.
      if (row.expires_at && Date.parse(row.expires_at) > now())
        return res.set('Cache-Control', 'no-store').json({ verification: view(row), verified: true });
      throw new ApiError(410, 'SITE_CHALLENGE_EXPIRED', 'Potwierdzenie wygasło. Utwórz i umieść na stronie nowy znacznik.');
    }
    if (Date.parse(row.challenge_expires_at) <= now())
      throw new ApiError(410, 'SITE_CHALLENGE_EXPIRED', 'Znacznik wygasł. Utwórz i umieść na stronie nowy znacznik.');
    if (running >= 2 || checking.has(row.id))
      throw new ApiError(429, 'SITE_BUSY', 'Trwa już sprawdzanie strony. Spróbuj ponownie za chwilę.');
    limit(`check:user:${user.id}`, 10, 60000);
    limit(`check:ip:${req.ip ?? 'unknown'}`, 30, 60000);
    running++; checking.add(row.id);
    try {
      const html = await fetchSiteHtml(`https://${row.host}/`, options);
      if (!hasVerificationMeta(html, row.token_hash))
        throw new ApiError(422, 'SITE_TOKEN_NOT_FOUND', 'Nie znaleziono aktualnego znacznika w sekcji head strony głównej. Wklej go w kodzie HTML i spróbuj ponownie.');
      const time = now(), timestamp = new Date(time).toISOString();
      const updated = db.prepare(`UPDATE site_verifications SET challenge_consumed_at=?,verified_at=?,expires_at=?,
        last_checked_at=?,last_error_code=NULL WHERE id=? AND user_id=? AND token_hash=?
        AND challenge_consumed_at IS NULL AND challenge_expires_at>?`)
        .run(timestamp, timestamp, new Date(time + VERIFICATION_MS).toISOString(), timestamp, row.id, user.id, row.token_hash, timestamp);
      if (!updated.changes)
        throw new ApiError(409, 'SITE_CHALLENGE_CHANGED', 'Znacznik zmienił się lub wygasł podczas sprawdzania. Wczytaj aktualne potwierdzenie.');
      const verified = db.prepare('SELECT * FROM site_verifications WHERE id=? AND user_id=?').get(row.id, user.id);
      res.set('Cache-Control', 'no-store').json({ verification: view(verified), verified: true });
    } catch (error) {
      const safeError = error instanceof ApiError ? error : new ApiError(502, 'SITE_FETCH_FAILED', 'Nie udało się sprawdzić strony. Spróbuj ponownie później.');
      db.prepare('UPDATE site_verifications SET last_checked_at=?,last_error_code=? WHERE id=? AND user_id=?')
        .run(new Date(now()).toISOString(), safeError.code, row.id, user.id);
      throw safeError;
    } finally { running--; checking.delete(row.id); }
  });
  return { getBadge };
}
