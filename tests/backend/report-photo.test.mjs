import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import sharp from 'sharp';
import exifr from 'exifr';
import { prepareReportImage, normalizePhotoAnalysis, analyzeReportPhoto, registerReportPhoto } from '../../server/report-photo.mjs';
import { parseReport, enrichReport } from '../../server/reports.mjs';
import { reportPhotoFixture } from '../helpers/report-photo-fixture.mjs';

const suggestion = { kind: 'steps', description: 'Dane testowe: schody przy wejściu.', effect: 'barrier', duration: 'permanent', suggestedGeometry: 'Point', evidence: 'Widoczne stopnie.', uncertainty: 'Brak pomiaru.' };
const normalized = () => normalizePhotoAnalysis({ observations: [suggestion], message: 'Propozycja do sprawdzenia.' });
const asData = bytes => `data:image/jpeg;base64,${bytes.toString('base64')}`;
const listeners = [];
after(async () => { await Promise.all(listeners.map(listener => new Promise(resolve => listener.close(resolve)))); });
async function serve(options = {}) {
  const app = express(); app.use(express.json({ limit: '6mb' }));
  app.locals.context = { auth: { getUser: req => req.headers['x-test-user'] ? { id: req.headers['x-test-user'] } : null } };
  registerReportPhoto(app, {}, { analyze: async () => normalized(), ...options });
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: { code: error.code, message: error.message } }));
  const listener = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  listeners.push(listener); return `http://127.0.0.1:${listener.address().port}`;
}
const clientId = 'isolated-photo-test-client-12345';
async function post(base, extra = {}, headers = {}) {
  const image = asData(await reportPhotoFixture());
  const response = await fetch(base + '/api/report-photos', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ clientId, image, ...extra }) });
  return { status: response.status, body: await response.json() };
}
async function done(base, id, token = clientId, headers = {}) {
  for (let i = 0; i < 30; i++) {
    const response = await fetch(`${base}/api/report-photos/${id}?clientId=${token}`, { headers });
    const body = await response.json();
    if (body.status !== 'analyzing') return { status: response.status, body };
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Test job timed out');
}
test('image preparation removes EXIF GPS and private tags, and rejects non-images', async () => {
  const source = await reportPhotoFixture();
  const gps = await exifr.gps(source); assert(Math.abs(gps.latitude - 50.06) < .000001); assert.equal(gps.longitude, 19.94);
  const prepared = Buffer.from((await prepareReportImage(asData(source))).split(',')[1], 'base64');
  assert.equal((await sharp(prepared).metadata()).exif, undefined);
  assert.equal(await exifr.gps(prepared), undefined);
  await assert.rejects(prepareReportImage('https://example.com/image.jpg'), e => e.code === 'INVALID_IMAGE');
  await assert.rejects(prepareReportImage(asData(Buffer.from('<svg>invalid</svg>'))), e => e.code === 'INVALID_IMAGE');
  await assert.rejects(prepareReportImage('x'.repeat(6_000_001)), e => e.status === 413);
});
test('model output cannot set coordinates, measured dimensions, precision or verification', () => {
  const value = normalizePhotoAnalysis({ message: 'test', observations: [{ ...suggestion, coordinates: [1,2], widthCm: 80, heightCm: 12, measurement: 'measured', verified: true }] }).observations[0];
  for (const key of ['coordinates', 'widthCm', 'heightCm', 'measurement', 'verified']) assert.equal(value[key], undefined);
  assert.equal(normalizePhotoAnalysis({ observations: [{ ...suggestion, description: 'Próg o wysokości 12 cm.' }] }).observations.length, 0);
  assert.equal(normalizePhotoAnalysis({ observations: [] }).observations.length, 0);
  assert.throws(() => normalizePhotoAnalysis({}), /INVALID_PHOTO_ANALYSIS/);
});
test('OpenAI call uses a bounded non-stored image request without location or account data', async () => {
  let request;
  const value = await analyzeReportPhoto('data:image/jpeg;base64,TEST', { apiKey: 'test-only', fetchImpl: async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/responses'); request = JSON.parse(init.body);
    return new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ observations: [suggestion], message: 'test' }) }] }] }));
  } });
  assert.equal(request.store, false); assert.equal(request.text.format.strict, true); assert(request.max_output_tokens < 3000);
  assert(!JSON.stringify(request).includes('expectedUserId')); assert.equal(value.observations[0].kind, 'steps');
  await assert.rejects(analyzeReportPhoto('test', { apiKey: '' }), /VISION_NOT_CONFIGURED/);
  await assert.rejects(analyzeReportPhoto('test', { apiKey: 'test', fetchImpl: async () => new Response('{}', { status: 503 }) }), /VISION_UNAVAILABLE/);
});
test('photo drafts stay private to both the requesting account and browser session', async () => {
  const base = await serve();
  const created = await post(base, {}, { 'x-test-user': 'owner' }); assert.equal(created.status, 202);
  const id = created.body.id;
  const own = await done(base, id, clientId, { 'x-test-user': 'owner' }); assert.equal(own.body.status, 'complete');
  assert.equal(own.body.result.observations.length, 1);
  assert.equal((await done(base, id)).status, 404);
  assert.equal((await done(base, id, 'other-client', { 'x-test-user': 'owner' })).status, 404);
  const json = JSON.stringify(own.body); assert(!json.includes('base64')); assert(!json.includes('ownerId')); assert(!json.includes('clientId'));
});
test('limits and failed providers leave a recoverable draft instead of publishing a report', async () => {
  const base = await serve({ rateLimit: 1, analyze: async () => { throw new Error('private provider failure'); } });
  const first = await post(base); assert.equal(first.status, 202);
  const result = await done(base, first.body.id); assert.equal(result.body.status, 'failed');
  assert(!result.body.message.includes('private provider'));
  assert.equal((await post(base)).status, 429);
});
test('photo-assisted reports require review, preserve source and stay unverified', () => {
  const input = { kind: 'steps', description: suggestion.description, coordinates: [19.94,50.06], inputMethod: 'photo-ai', locationSource: 'photo-gps' };
  assert.throws(() => parseReport(input), /Sprawdź opis/);
  const report = parseReport({ ...input, photoReviewed: true });
  assert.equal(report.locationAccuracy, 'approximate'); assert.equal(report.widthCm, null); assert.equal(report.measurement, 'unknown');
  const view = enrichReport({ id: 'test', kind: report.kind, lon: 19.94, lat: 50.06, description: report.description, created_at: report.observedAt, status: 'active' }, { data: JSON.stringify(report) });
  assert.equal(view.verification, 'unverified'); assert.match(view.sourceLabel, /AI/);
  assert.throws(() => parseReport({ ...input, photoReviewed: true, locationSource: 'model-guess' }));
});
