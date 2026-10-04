import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { request } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import { createPublicApp } from '../../server/public-server.mjs';

function post(url, headers) {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: 'POST', headers }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('public ingress validates host and preserves the HTTPS protocol used by the proxy', async t => {
  const api = express();
  api.post('/api/probe', (req, res) => {
    if (req.get('origin') !== `${req.protocol}://${req.get('host')}`) return res.status(403).json({ protocol: req.protocol, host: req.get('host'), origin: req.get('origin') });
    res.json({ protocol: req.protocol, ip: req.ip });
  });
  const server = createPublicApp({ api }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/probe`;
  const headers = { host: 'miastowzasiegu.pl', origin: 'https://miastowzasiegu.pl', 'x-forwarded-proto': 'https', 'x-forwarded-for': '203.0.113.5' };
  const correct = await post(url, headers);
  const body = JSON.parse(correct.body);
  assert.equal(correct.status, 200, JSON.stringify(body));
  assert.deepEqual(body, { protocol: 'https', ip: '203.0.113.5' });
  assert.equal((await post(url, { ...headers, origin: 'https://unrelated.example' })).status, 403);
  assert.equal((await post(url, { ...headers, host: 'unrelated.example' })).status, 421);
});

test('an optional game entry preserves the main app and training query, with a full-build fallback', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'iskry-public-'));
  writeFileSync(join(dir, 'index.html'), '<h1>Main application fixture</h1>');
  mkdirSync(join(dir, 'iskry'));
  writeFileSync(join(dir, 'iskry/index.html'), '<h1>Game fixture</h1>');
  const server = createPublicApp({ api: express(), distPath: dir }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve));
    assert.equal(dirname(resolve(dir)), resolve(tmpdir())); assert(basename(dir).startsWith('iskry-public-'));
    rmSync(dir, { recursive: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const path of ['/gra', '/gra/', '/gra?tryb=ogrod']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-cache');
    assert.match(await response.text(), /Game fixture/);
  }
  assert.match(await (await fetch(base + '/app')).text(), /Main application fixture/);
  assert.match(await (await fetch(base + '/')).text(), /Main application fixture/);
  rmSync(join(dir, 'iskry/index.html'));
  assert.match(await (await fetch(base + '/gra')).text(), /Main application fixture/);
});
