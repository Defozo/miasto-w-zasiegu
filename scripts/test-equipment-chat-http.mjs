import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const base = process.argv[2] || 'http://127.0.0.1:3081';
const clientId = randomUUID();
const turns = [];
async function request(path, body) {
  const response = await fetch(`${base}/api/equipment/research${path}`, {
    method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.ok(response.ok, `HTTP ${response.status}`);
  return response.json();
}
async function completed(job) {
  const deadline = Date.now() + 180000;
  while (job.status === 'searching' && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    job = await request(`/${job.id}?clientId=${clientId}`);
  }
  assert.notEqual(job.status, 'searching', 'Research timed out');
  assert.notEqual(job.status, 'failed', 'Research provider failed');
  turns.push(job);
  console.log(JSON.stringify({ status: job.status, message: job.message, suggestions: job.suggestions, canApply: job.canApply,
    identifiedKind: job.identifiedKind, widthCm: job.equipment?.widthCm, messages: job.messages?.length }));
  return job;
}
try {
  let job = await completed(await request('', { kind: 'power', clientId, conversational: true, expectedUserId: null,
    query: 'Vitea Care Cameleon VCWK9AC, rozmiaru nie znam' }));
  assert.equal(job.canApply, false);
  assert.equal(job.equipment?.widthCm ?? null, null);
  job = await completed(await request(`/${job.id}/messages`, { clientId, expectedUserId: null,
    text: 'Tak, to mój ręczny wózek bez dołożonego napędu. Sprawdziłem etykietę: rozmiar 18 cali.' }));
  assert.equal(job.canApply, true); assert.equal(job.identifiedKind, 'manual'); assert.equal(job.equipment?.widthCm, 64);
  assert.equal(job.messages.length, 4);
  await writeFile('artifacts/equipment-chat-http-live.json', JSON.stringify({ base, checkedAt: new Date().toISOString(), turns }, null, 2));
  console.log('HTTP conversation passed; no presets or catalogue entries were written.');
} catch (error) {
  await writeFile('artifacts/equipment-chat-http-live.json', JSON.stringify({ base, checkedAt: new Date().toISOString(), turns, error: error.message }, null, 2));
  console.error(error.message); process.exitCode = 1;
}
