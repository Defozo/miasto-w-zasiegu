import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { createClerkClient } from '@clerk/backend';
import { createAuth, requireUser } from '../../server/auth.mjs';
import { registerFavorites } from '../../server/favorites.mjs';

// Real SDK signature/expiry/origin checks, local keys, no Clerk users or network writes.
const issuer = 'https://auth-fixture.clerk.accounts.dev';
const publishableKey = 'pk_test_' + Buffer.from(new URL(issuer).hostname + '$').toString('base64');
const secretKey = 'sk_test_local_fixture_only';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwtKey = publicKey.export({ type: 'spki', format: 'pem' });
const origin = 'http://127.0.0.1:4173';
const sdk = createClerkClient({ publishableKey, secretKey, telemetry: { disabled: true } });
const services = [];
after(async () => { for (const { server, db } of services) { await new Promise(resolve => server.close(resolve)); db.close(); } });
function token(subject = 'user_alice', claims = {}, key = privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const body = { iss: issuer, sub: subject, sid: `sess_${subject}`, iat: now, nbf: now - 1, exp: now + 60, azp: origin, v: 2, ...claims };
  const parts = [Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'fixture' })).toString('base64url'), Buffer.from(JSON.stringify(body)).toString('base64url')];
  parts.push(sign('RSA-SHA256', Buffer.from(parts.join('.')), key).toString('base64url'));
  return parts.join('.');
}
async function service(options = {}) {
  const db = new DatabaseSync(':memory:');
  const app = express(), revoked = [], userLookups = [];
  const client = {
    authenticateRequest: (...args) => sdk.authenticateRequest(...args),
    users: { getUser: async id => {
      userLookups.push(id);
      if (options.unavailable) throw new Error('Offline fixture');
      return { id, firstName: id.slice(5), primaryEmailAddressId: 'email_1',
        emailAddresses: [{ id: 'email_1', emailAddress: 'same@example.test', verification: { status: options.unverified ? 'unverified' : 'verified' } }] };
    } },
    sessions: { revokeSession: async id => { if (options.revokeFails) throw new Error('Offline fixture'); revoked.push(id); } },
  };
  const auth = createAuth(db, { publishableKey, secretKey, jwtKey, authorizedParties: [origin], client, ...options.auth });
  app.locals.context = { db, auth };
  app.use(express.json()); app.use('/api', auth.middleware);
  auth.registerRoutes(app); registerFavorites(app, { db, auth, getUser: req => auth.getUser(req) });
  app.post('/api/protected', (req, res) => res.json({ id: requireUser(req).id }));
  app.post('/api/optional', (req, res) => res.json({ user: auth.getUser(req) }));
  app.use((error, _req, res, _next) => res.status(error.status ?? 500).json({ error: { code: error.code, message: error.message } }));
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  services.push({ server, db });
  return { db, revoked, userLookups, async call(path, bearer, body, method = body === undefined ? 'GET' : 'POST', extraHeaders = {}) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { method,
      headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extraHeaders },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  } };
}
const profile = { mobility: 'manual', widthCm: '65', maxIncline: '6', maxKerbCm: '2', avoidUnpaved: true };

test('Clerk config exposes only the public key, old password endpoints are gone, anonymous browsing stays available', async () => {
  const s = await service();
  assert.deepEqual((await s.call('/auth/config')).body, { provider: 'clerk', configured: true, publishableKey });
  assert.equal((await s.call('/auth/me')).body.user, null);
  assert.equal((await s.call('/protected', null, {})).status, 401);
  for (const path of ['/auth/register', '/auth/login']) assert.equal((await s.call(path, null, { email: 'same@example.test', password: 'not-used' })).status, 410);
  assert.equal((await s.call('/auth/me', null, undefined, 'GET', { Cookie: 'przejscie_session=' + 'a'.repeat(64) })).body.user, null);
});

test('real Clerk JWT verification creates a password-free identity and preserves profile versioning and account isolation', async () => {
  const s = await service(), alice = token(), bob = token('user_bob');
  const a = await s.call('/auth/me', alice); assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.equal(a.body.user.id, 'clerk:user_alice'); assert.equal(a.body.user.email, 'same@example.test');
  assert.equal(s.db.prepare('SELECT password_hash FROM users WHERE id=?').get(a.body.user.id).password_hash, '');
  const saved = await s.call('/profile', alice, { profile, expectedVersion: 0 }, 'PUT'); assert.equal(saved.status, 200);
  assert.equal(saved.body.profileVersion, 1);
  assert.equal((await s.call('/profile', alice, { profile, expectedVersion: 0 }, 'PUT')).status, 409);
  const b = await s.call('/auth/me', bob); assert.equal(b.status, 200); assert.notEqual(b.body.user.id, a.body.user.id);
  assert.equal(b.body.profile, null); assert.equal(b.body.user.email, a.body.user.email);
  assert.deepEqual((await s.call('/auth/me', token('user_alice', { sid: 'sess_second_device' }))).body.profile, profile);
  assert.equal(s.userLookups.filter(id => id === 'user_alice').length, 1);
});

test('legacy unverified account with the same email is never automatically claimed', async () => {
  const s = await service();
  s.db.prepare('INSERT INTO users(id,email,display_name,password_hash,profile_json,created_at) VALUES(?,?,?,?,?,?)')
    .run('legacy', 'same@example.test', 'Legacy', 'old-hash', JSON.stringify(profile), new Date().toISOString());
  const result = await s.call('/auth/me', token()); assert.equal(result.status, 200); assert.equal(result.body.profile, null);
  assert.notEqual(result.body.user.id, 'legacy');
  assert.equal(s.db.prepare('SELECT profile_json FROM users WHERE id=?').get('legacy').profile_json, JSON.stringify(profile));
});

test('invalid signatures, expired tokens and disallowed origins cannot authenticate or become anonymous writes', async () => {
  const s = await service();
  const otherKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  const invalid = [token('user_alice', {}, otherKey), token('user_alice', { exp: 1 }), token('user_alice', { nbf: 9999999999 }),
    token('user_alice', { azp: 'https://attacker.example' }), 'not-a-jwt'];
  for (const bearer of invalid) {
    const result = await s.call('/optional', bearer, {}); assert.equal(result.status, 401, JSON.stringify(result.body));
  }
  assert.equal(s.db.prepare('SELECT count(*) AS n FROM users').get().n, 0);
});

test('SDK validation allows a native session without browser azp', async () => {
  const s = await service();
  const result = await s.call('/auth/me', token('user_native', { azp: undefined }));
  assert.equal(result.status, 200, JSON.stringify(result.body)); assert.equal(result.body.user.id, 'clerk:user_native');
});

test('logout revokes only this device and the same signed JWT is immediately rejected', async () => {
  const s = await service(), current = token(), other = token('user_alice', { sid: 'sess_another_device' });
  assert.equal((await s.call('/auth/logout', current, {})).status, 200);
  assert.deepEqual(s.revoked, ['sess_user_alice']);
  assert.equal((await s.call('/auth/me', current)).status, 401);
  assert.equal((await s.call('/auth/me', other)).status, 200);
});

test('provider failures fail closed while anonymous requests remain usable', async () => {
  const s = await service({ unavailable: true });
  assert.equal((await s.call('/optional', token(), {})).status, 503);
  assert.equal((await s.call('/auth/me')).status, 200);
  assert.equal(s.db.prepare('SELECT count(*) AS n FROM users').get().n, 0);
  const badLogout = await service({ revokeFails: true });
  assert.equal((await badLogout.call('/auth/logout', token(), {})).status, 503);
  assert.equal((await badLogout.call('/auth/me', token())).status, 200);
});

test('missing config disables authentication without exposing secrets or enabling password fallback', async () => {
  const s = await service({ auth: { secretKey: '', publishableKey: '' } });
  assert.deepEqual((await s.call('/auth/config')).body, { provider: 'clerk', configured: false, publishableKey: null });
  assert.equal((await s.call('/auth/me', token())).status, 503);
  assert.equal((await s.call('/auth/me')).body.user, null);
});

test('unverified Clerk email is not presented as verified profile data', async () => {
  const s = await service({ unverified: true });
  assert.equal((await s.call('/auth/me', token())).body.user.email, '');
});
