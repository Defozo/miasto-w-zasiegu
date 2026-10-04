import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { createAuth as localTestAuth } from '../helpers/local-auth.mjs';
import { ApiError } from '../../server/routing.mjs';
import { fetchSiteHtml, isPublicSiteAddress, normalizeSiteUrl } from '../../server/safe-site-fetch.mjs';
import { hasVerificationMeta, registerSiteVerificationRoutes } from '../../server/site-verification.mjs';

const DAY = 86400000;
const START = Date.parse('2026-10-03T12:00:00Z');
const PUBLIC_IP = '93.184.216.34';
const publicDns = async () => [{ address: PUBLIC_IP, family: 4 }];
const hash = value => createHash('sha256').update(value).digest('hex');
const page = meta => `<!doctype html><html><head>${meta}</head><body>Strona testowa</body></html>`;
const tokenOf = response => /content="([a-f0-9]{64})"/.exec(response.body.metaTag)[1];

function transport(responseFor = () => ({ body: page('') })) {
  const seen = [];
  function request(options, callback) {
    seen.push(options);
    const req = new EventEmitter();
    let destroyed = false, incoming;
    const cleanup = () => options.signal.removeEventListener('abort', abort);
    const abort = () => req.destroy(options.signal.reason ?? new Error('aborted'));
    req.destroy = (error = new Error('closed')) => {
      if (destroyed) return;
      destroyed = true;
      cleanup();
      incoming?.destroy();
      queueMicrotask(() => req.emit('error', error));
      return req;
    };
    req.end = () => {
      Promise.resolve().then(() => responseFor(options)).then(spec => {
        if (destroyed || spec.hang) return;
        if (spec.error) return req.destroy(spec.error);
        incoming = new PassThrough();
        incoming.statusCode = spec.status ?? 200;
        incoming.headers = { 'content-type': 'text/html; charset=utf-8', ...spec.headers };
        incoming.once('end', cleanup);
        callback(incoming);
        if (destroyed || spec.hangBody) return;
        for (const chunk of spec.chunks ?? [spec.body ?? '']) incoming.write(Buffer.from(chunk));
        incoming.end();
      }).catch(error => req.destroy(error));
    };
    options.signal.addEventListener('abort', abort, { once: true });
    return req;
  }
  request.seen = seen;
  return request;
}

async function fixture(t, options = {}) {
  const db = new DatabaseSync(':memory:');
  const auth = localTestAuth(db);
  const tokens = { alice: 'a'.repeat(64), bob: 'b'.repeat(64) };
  for (const id of Object.keys(tokens)) {
    db.prepare('INSERT INTO users(id,email,display_name,password_hash,created_at) VALUES(?,?,?,?,?)')
      .run(id, `${id}@example.test`, id, 'unused-in-this-test', new Date(START).toISOString());
    db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)')
      .run(hash(tokens[id]), id, '2100-01-01T00:00:00.000Z', new Date(START).toISOString());
  }
  let clock = START, html = page(''), listener, service;
  const requestImpl = options.requestImpl ?? transport(() => ({ body: html }));
  const context = { db, auth };
  async function open() {
    const app = express();
    app.locals.context = context;
    app.use(express.json({ limit: '16kb' }));
    service = registerSiteVerificationRoutes(app, context, { now: () => clock, resolveAddresses: publicDns, ...options, requestImpl });
    app.use((error, _req, res, _next) => {
      res.status(error instanceof ApiError ? error.status : 500).json({ error: { code: error.code, message: error.message } });
    });
    listener = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  }
  await open();
  t.after(async () => { await new Promise(resolve => listener.close(resolve)); db.close(); });
  async function call(path = '', { method = 'GET', user = 'alice', body, cookie = false } = {}) {
    const response = await fetch(`http://127.0.0.1:${listener.address().port}/api/site-verifications${path}`, {
      method,
      headers: { ...(user ? cookie ? { Cookie: `przejscie_session=${tokens[user]}` } : { Authorization: `Bearer ${tokens[user]}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  return { db, call, requestImpl, get service() { return service; }, setHtml(value) { html = value; }, advance(ms) { clock += ms; },
    create: (websiteUrl = 'https://example.org/place', user = 'alice') => call('', { method: 'POST', user, body: { websiteUrl, expectedUserId: user } }),
    check: (id, user = 'alice') => call(`/${id}/check`, { method: 'POST', user, body: { expectedUserId: user } }),
    async restart() { await new Promise(resolve => listener.close(resolve)); await open(); } };
}

test('site URLs bind exact HTTPS hosts and fetch only the root page', () => {
  assert.deepEqual(normalizeSiteUrl('https://WWW.Example.org:443/muzeum/dostepnosc'),
    { host: 'www.example.org', verificationUrl: 'https://www.example.org/' });
  assert.match(normalizeSiteUrl('https://żółw.example.org/').host, /^xn--/);
  for (const url of ['http://example.org/', 'https://example.org:8443/', 'https://user:pass@example.org/',
    'https://127.1/', 'https://2130706433/', 'https://0x7f000001/', 'https://[::1]/', 'https://localhost/',
    'https://x.local/', 'https://x.internal/', 'https://x.invalid/', 'https://example.org./',
    'https://example.org/?', 'https://example.org/#', 'https://example.org/?q=1', ' https://example.org/', 'https://exa_mple.org/'])
    assert.throws(() => normalizeSiteUrl(url), { code: 'INVALID_SITE_URL' }, url);
});

test('public address classification rejects private, special and mapped IP ranges', () => {
  for (const address of [PUBLIC_IP, '8.8.8.8', '2606:4700:4700::1111', '2001:4860:4860::8888'])
    assert.equal(isPublicSiteAddress(address), true, address);
  for (const address of ['0.0.0.0', '10.2.3.4', '100.64.0.1', '127.0.0.1', '169.254.169.254', '172.31.255.1',
    '192.0.0.1', '192.0.2.1', '192.168.1.1', '198.18.0.1', '198.51.100.1', '203.0.113.1', '224.1.1.1', '255.255.255.255',
    '::', '::1', '::ffff:127.0.0.1', '::ffff:93.184.216.34', 'fc00::1', 'fe80::1', 'ff02::1', '64:ff9b::7f00:1',
    '2001:db8::1', '2001::1', '2002:7f00:1::', '3fff::1', '2606:4700::1%eth0', 'not-an-ip'])
    assert.equal(isPublicSiteAddress(address), false, address);
});

test('all DNS records must be public before a connection is attempted', async () => {
  const requestImpl = transport();
  for (const records of [[], [{ address: '127.0.0.1', family: 4 }],
    [{ address: PUBLIC_IP, family: 4 }, { address: '10.0.0.1', family: 4 }],
    [{ address: PUBLIC_IP, family: 4 }, { address: '::ffff:127.0.0.1', family: 6 }],
    [{ address: PUBLIC_IP, family: 4 }, { address: 'fc00::1', family: 6 }],
    [{ address: PUBLIC_IP, family: 6 }], [{ address: 123, family: 4 }], [null],
    Array.from({ length: 65 }, () => ({ address: PUBLIC_IP, family: 4 }))]) {
    await assert.rejects(fetchSiteHtml('https://example.org/', { resolveAddresses: async () => records, requestImpl }), { code: 'SITE_ADDRESS_BLOCKED' });
  }
  await assert.rejects(fetchSiteHtml('https://example.org/', { resolveAddresses: async () => { throw new Error('private DNS details'); }, requestImpl }),
    error => error.code === 'SITE_DNS_UNAVAILABLE' && !error.message.includes('private DNS'));
  assert.equal(requestImpl.seen.length, 0);
});

test('HTTPS pins the validated IP, keeps hostname certificate checking and sends no user credentials', async () => {
  let resolutions = 0;
  const requestImpl = transport(() => ({ body: page('') }));
  await fetchSiteHtml('https://example.org/path', { resolveAddresses: async () => { resolutions++; return publicDns(); }, requestImpl });
  assert.equal(resolutions, 1);
  const request = requestImpl.seen[0];
  assert.equal(request.hostname, 'example.org'); assert.equal(request.servername, 'example.org');
  assert.equal(request.rejectUnauthorized, true); assert.equal(request.port, 443); assert.equal(request.path, '/');
  assert.equal(request.method, 'GET'); assert.equal(request.autoSelectFamily, false);
  assert.equal(request.headers.Host, 'example.org');
  assert.equal(Object.keys(request.headers).some(key => /cookie|authorization/i.test(key)), false);
  assert.deepEqual(await new Promise((resolve, reject) => request.lookup('example.org', { all: true }, (error, value) => error ? reject(error) : resolve(value))),
    [{ address: PUBLIC_IP, family: 4 }]);
  assert.equal(await new Promise((resolve, reject) => request.lookup('example.org', {}, (error, value) => error ? reject(error) : resolve(value))), PUBLIC_IP);
  await assert.rejects(new Promise((resolve, reject) => request.lookup('other.example.org', {}, (error, value) => error ? reject(error) : resolve(value))),
    { code: 'SITE_FETCH_FAILED' });
  assert.equal(resolutions, 1, 'lookup must not resolve the hostname again after validation');
});

test('redirects, invalid content, excessive body and TLS errors fail with bounded messages', async () => {
  for (const [spec, code] of [
    [{ status: 302, headers: { location: 'https://127.0.0.1/private' } }, 'SITE_REDIRECT'],
    [{ status: 404 }, 'SITE_HTTP_ERROR'],
    [{ headers: { 'content-type': 'application/json' } }, 'SITE_NOT_HTML'],
    [{ headers: { 'content-encoding': 'gzip' } }, 'SITE_UNSUPPORTED_ENCODING'],
    [{ headers: { 'content-length': '9999' } }, 'SITE_RESPONSE_TOO_LARGE'],
    [{ chunks: ['x'.repeat(40), 'x'.repeat(40)] }, 'SITE_RESPONSE_TOO_LARGE'],
    [{ error: new Error('certificate error with secret-token') }, 'SITE_FETCH_FAILED'],
  ]) {
    const requestImpl = transport(() => spec);
    await assert.rejects(fetchSiteHtml('https://example.org/', { resolveAddresses: publicDns, requestImpl, maxResponseBytes: 64 }),
      error => error.code === code && !error.message.includes('secret-token'));
    assert.equal(requestImpl.seen.length, 1, 'redirects never cause another request');
  }
});

test('the total deadline includes DNS resolution and an unfinished response body', async () => {
  await assert.rejects(fetchSiteHtml('https://example.org/', { resolveAddresses: () => new Promise(() => {}), timeoutMs: 15 }), { code: 'SITE_TIMEOUT' });
  await assert.rejects(fetchSiteHtml('https://example.org/', { resolveAddresses: publicDns,
    requestImpl: transport(() => ({ hangBody: true })), timeoutMs: 15 }), { code: 'SITE_TIMEOUT' });
});

test('only a real matching HTML meta element in head proves control', () => {
  const token = 'a'.repeat(64), meta = `<meta name="przejscie-site-verification" content="${token}">`;
  assert.equal(hasVerificationMeta(page(meta), hash(token)), true);
  assert.equal(hasVerificationMeta(page(`<META CONTENT='${token}' NAME='przejscie-site-verification'>`), hash(token)), true);
  for (const html of [page(`<!-- ${meta} -->`), page(`<script>const value = '${meta}'</script>`),
    page(`<style>/* ${meta} */</style>`), page(`<template>${meta}</template>`), page(`<noscript>${meta}</noscript>`),
    `<html><head></head><body>${meta}</body></html>`, page(meta.replace(token, 'b'.repeat(64))), page(meta.replace('przejscie-site-verification', 'another-verifier'))])
    assert.equal(hasVerificationMeta(html, hash(token)), false, html);
});

test('private site verification API rejects guests, another account and stale browser identity', async t => {
  const f = await fixture(t);
  assert.equal((await f.call('', { user: null })).status, 401);
  assert.equal((await f.create('https://example.org/', null)).status, 401);
  const created = await f.create();
  assert.equal(created.status, 201);
  const verification = created.body.verification;
  assert.equal(verification.host, 'example.org'); assert.equal(verification.verificationUrl, 'https://example.org/');
  assert.equal(verification.status, 'pending'); assert.equal(verification.challengeExpiresAt, new Date(START + DAY).toISOString());
  const token = tokenOf(created), stored = f.db.prepare('SELECT token_hash FROM site_verifications').get();
  assert.equal(stored.token_hash, hash(token)); assert.notEqual(stored.token_hash, token);
  assert.equal((await f.check(verification.id, null)).status, 401);
  assert.equal((await f.check(verification.id, 'bob')).status, 404);
  assert.deepEqual((await f.call('', { user: 'bob' })).body.verifications, []);
  assert.equal((await f.call('?expectedUserId=bob')).status, 409);
  assert.equal((await f.call('', { method: 'POST', body: { websiteUrl: 'https://example.org/', expectedUserId: 'bob' } })).status, 409);
  assert.equal((await f.call(`/${verification.id}/check`, { method: 'POST', body: { expectedUserId: 'bob' } })).status, 409);
  const listed = await f.call('?expectedUserId=alice', { cookie: true });
  assert.equal(listed.status, 200); assert.equal(listed.headers.get('cache-control'), 'no-store');
  assert.equal(JSON.stringify(listed.body).includes(token), false);
  assert.equal(JSON.stringify(listed.body).includes('alice@example.test'), false);
  assert.equal((await f.create('http://example.org/')).status, 400);
  assert.equal(f.requestImpl.seen.length, 0);
});

test('verified badge is author and exact-host bound, persists across restart and expires after 30 days', async t => {
  const f = await fixture(t);
  const created = await f.create(), id = created.body.verification.id;
  f.setHtml(page(created.body.metaTag));
  const verified = await f.check(id);
  assert.equal(verified.status, 200); assert.equal(verified.body.verified, true);
  assert.equal(verified.body.verification.status, 'verified');
  assert.equal(verified.body.verification.expiresAt, new Date(START + 30 * DAY).toISOString());
  const expected = { host: 'example.org', verifiedAt: new Date(START).toISOString(), expiresAt: new Date(START + 30 * DAY).toISOString() };
  assert.deepEqual(f.service.getBadge('alice', 'https://example.org/muzeum?lang=pl#access'), expected);
  assert.equal(f.service.getBadge('bob', 'https://example.org/'), null);
  assert.equal(f.service.getBadge('alice', 'https://www.example.org/'), null);
  assert.equal(f.service.getBadge('alice', 'https://other.example.org/'), null);
  assert.equal(f.service.getBadge('alice', 'http://example.org/'), null);
  await f.restart();
  assert.deepEqual(f.service.getBadge('alice', 'https://example.org/'), expected);
  f.advance(DAY);
  const retried = await f.check(id);
  assert.equal(retried.status, 200); assert.equal(retried.body.verification.expiresAt, expected.expiresAt);
  assert.equal(f.requestImpl.seen.length, 1, 'replaying a used challenge never extends the proof');
  f.advance(29 * DAY);
  assert.equal(f.service.getBadge('alice', 'https://example.org/'), null);
  assert.equal((await f.call()).body.verifications[0].status, 'expired');
  assert.equal((await f.check(id)).status, 410);
});

test('renewal rotates challenge and rejects old or cross-account tokens', async t => {
  const f = await fixture(t);
  const old = await f.create(), renewed = await f.create(), other = await f.create('https://example.org/', 'bob');
  assert.notEqual(old.body.verification.id, renewed.body.verification.id);
  assert.notEqual(tokenOf(old), tokenOf(renewed));
  assert.equal((await f.check(old.body.verification.id)).status, 404);
  f.setHtml(page(old.body.metaTag));
  assert.equal((await f.check(renewed.body.verification.id)).status, 422);
  f.setHtml(page(other.body.metaTag));
  assert.equal((await f.check(renewed.body.verification.id)).status, 422);
  assert.equal(f.service.getBadge('alice', 'https://example.org/'), null);
  f.setHtml(page(renewed.body.metaTag));
  assert.equal((await f.check(renewed.body.verification.id)).status, 200);
  assert.equal(f.service.getBadge('bob', 'https://example.org/'), null);
});

test('expired unused challenge is rejected before DNS or HTTP', async t => {
  const f = await fixture(t);
  const created = await f.create();
  f.advance(DAY);
  assert.equal((await f.check(created.body.verification.id)).status, 410);
  assert.equal((await f.call()).body.verifications[0].status, 'expired');
  assert.equal(f.requestImpl.seen.length, 0);
});

test('a challenge replaced during a pending check cannot grant a badge', async t => {
  let release, started;
  const waiting = new Promise(resolve => { release = resolve; });
  const requested = new Promise(resolve => { started = resolve; });
  const f = await fixture(t, { requestImpl: transport(() => { started(); return waiting; }) });
  const first = await f.create();
  const pending = f.check(first.body.verification.id);
  await requested;
  const second = await f.create();
  release({ body: page(first.body.metaTag) });
  const completed = await pending;
  assert.equal(completed.status, 409); assert.equal(completed.body.error.code, 'SITE_CHALLENGE_CHANGED');
  assert.equal(f.service.getBadge('alice', 'https://example.org/'), null);
  assert.equal((await f.call()).body.verifications[0].id, second.body.verification.id);
  assert.equal((await f.call()).body.verifications[0].lastErrorCode, null);
});

test('challenge expiry is checked again after the network response', async t => {
  let release, started;
  const waiting = new Promise(resolve => { release = resolve; });
  const requested = new Promise(resolve => { started = resolve; });
  const f = await fixture(t, { requestImpl: transport(() => { started(); return waiting; }) });
  const created = await f.create(), pending = f.check(created.body.verification.id);
  await requested;
  f.advance(DAY);
  release({ body: page(created.body.metaTag) });
  assert.equal((await pending).status, 409);
  assert.equal(f.service.getBadge('alice', 'https://example.org/'), null);
});

test('failures expose only bounded error codes and checks are rate limited', async t => {
  const f = await fixture(t);
  const created = await f.create(), id = created.body.verification.id;
  f.setHtml(page(`<!-- ${created.body.metaTag} -->`));
  for (let attempt = 0; attempt < 10; attempt++) {
    const failed = await f.check(id);
    assert.equal(failed.status, 422); assert.equal(failed.body.error.code, 'SITE_TOKEN_NOT_FOUND');
    assert.equal(JSON.stringify(failed.body).includes(tokenOf(created)), false);
  }
  assert.equal((await f.check(id)).status, 429);
  assert.equal(f.requestImpl.seen.length, 10);
  const list = (await f.call()).body.verifications;
  assert.equal(list[0].lastErrorCode, 'SITE_TOKEN_NOT_FOUND');
  assert.equal(list[0].lastCheckedAt, new Date(START).toISOString());
});

test('only two checks run concurrently, and duplicate checks do not start another request', async t => {
  const releases = new Map(), starts = [];
  const f = await fixture(t, { requestImpl: transport(options => {
    for (const resolve of starts.splice(0)) resolve();
    return new Promise(resolve => releases.set(options.hostname, resolve));
  }) });
  const first = await f.create('https://one.example.org/'), second = await f.create('https://two.example.org/'), third = await f.create('https://three.example.org/');
  const waitForStart = () => new Promise(resolve => starts.push(resolve));
  let started = waitForStart();
  const a = f.check(first.body.verification.id); await started;
  assert.equal((await f.check(first.body.verification.id)).status, 429);
  started = waitForStart();
  const b = f.check(second.body.verification.id); await started;
  assert.equal((await f.check(third.body.verification.id)).status, 429);
  assert.equal(f.requestImpl.seen.length, 2);
  releases.get('one.example.org')({ body: page(first.body.metaTag) });
  releases.get('two.example.org')({ body: page(second.body.metaTag) });
  assert.equal((await a).status, 200); assert.equal((await b).status, 200);
});
