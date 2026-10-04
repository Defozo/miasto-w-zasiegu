import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { createAuth } from '../helpers/local-auth.mjs';
import { registerEquipmentResearch } from '../../server/equipment-research.mjs';
import { converseEquipment, normalizeConversation } from '../../server/equipment-conversation.mjs';

// Isolated evidence fixtures. No observations or catalogue entries are published.
const url = 'https://manufacturer.example/cameleon';
const raw = {
  found: true, name: 'CAMELEON', manufacturer: 'Vitea Care', variant: '18 cali',
  widthCm: 64, widthLabel: '64 cm', notes: 'Brak promienia skrętu. Tolerancja ±1 cm.',
  parameters: [{ label: 'Szerokość całkowita', value: '64 cm', quote: 'Wheelchair width (cm) 64', sourceUrl: url }],
  sources: [{ title: 'Dokumentacja testowa', url }],
  message: 'Model ma szerokość 64 cm.', question: '', suggestions: [],
  identifiedKind: 'manual', kindConfirmed: true, variantResolved: true, readyToApply: true,
};
const history = [{ role: 'user', text: 'Cameleon' }, { role: 'assistant', text: 'Jaki rozmiar?' }, { role: 'user', text: '18 cali' }];

test('a mismatched category cannot be applied on the initial turn, even when the model claims confirmation', () => {
  const result = normalizeConversation(raw, [url], history.slice(0, 1), 'power');
  assert.equal(result.identifiedKind, 'manual');
  assert.equal(result.canApply, false);
  assert.equal(result.equipment.widthCm, null);
  assert.ok(result.question);
});
test('resolved variants retain documented width and unknown variants never get a scalar', () => {
  const result = normalizeConversation(raw, [url], history, 'manual');
  assert.equal(result.canApply, true);
  assert.equal(result.equipment.widthCm, 64);
  const unknown = normalizeConversation({ ...raw, variantResolved: false }, [url], history, 'manual');
  assert.equal(unknown.canApply, true);
  assert.equal(unknown.equipment.widthCm, null);
});
test('enumerated widths and conflicts cannot autofill, even if the model proposes one value', () => {
  for (const changes of [
    { widthLabel: '59 cm (16″), 64 cm (18″) lub 70 cm (20″)' },
    { widthLabel: '59/64/70 cm' },
    { widthLabel: '59, 70, 64 cm' },
    { notes: 'Sprzeczne dane producenta i instrukcji.' },
  ]) {
    const result = normalizeConversation({ ...raw, ...changes }, [url], history, 'manual');
    assert.equal(result.equipment.widthCm, null);
  }
});
test('a stated dimensional tolerance is not mistaken for a second size', () => {
  const result = normalizeConversation({ ...raw, widthLabel: '64 cm ±1 cm' }, [url], history, 'manual');
  assert.equal(result.equipment.widthCm, 64);
});
test('missing sources produce a follow-up, not an applicable fabricated specification', () => {
  const result = normalizeConversation({ ...raw, suggestions: ['16 cali', '16 cali', '18 cali'] }, [], history, 'manual');
  assert.equal(result.equipment, null);
  assert.equal(result.canApply, false);
  assert.deepEqual(result.suggestions, ['16 cali', '18 cali', 'Nie wiem']);
});
test('provider receives the whole conversation and may reuse only previously validated evidence', async () => {
  let request;
  const result = await converseEquipment(history, 'manual', {
    apiKey: 'isolated-test', equipment: { sources: raw.sources },
    fetchImpl: async (_url, init) => {
      request = JSON.parse(init.body);
      return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(raw) }] }] }));
    },
  });
  assert.equal(request.store, false);
  assert.deepEqual(JSON.parse(request.input).conversation, history);
  assert.equal(result.equipment.widthCm, 64);
});

const opened = [];
after(async () => { for (const { server, db } of opened) { await new Promise(resolve => server.close(resolve)); db.close(); } });
async function service(converse) {
  const db = new DatabaseSync(':memory:'), app = express(), auth = createAuth(db);
  const context = { db, auth }; app.locals.context = context;
  app.use(express.json()); auth.registerRoutes(app); registerEquipmentResearch(app, context, { converse });
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: { code: error.code, message: error.message } }));
  const server = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  opened.push({ server, db });
  return async (path, body, token) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  };
}
const clientId = 'isolated-chat-client-12345';

test('continuation retains history, rejects foreign clients and serializes concurrent answers', async () => {
  let finish;
  const gate = new Promise(resolve => { finish = resolve; });
  const captured = [];
  const call = await service(async messages => {
    captured.push(structuredClone(messages));
    if (captured.length === 2) await gate;
    return normalizeConversation({ ...raw, readyToApply: captured.length > 1 }, [url], messages, 'manual');
  });
  const start = await call('/equipment/research', { kind: 'manual', query: 'Cameleon', clientId, conversational: true });
  assert.equal(start.status, 202);
  const path = `/equipment/research/${start.body.id}`;
  const first = await call(`${path}?clientId=${clientId}`);
  assert.equal(first.body.status, 'needs_reply');
  assert.equal(first.body.messages.length, 2);
  assert.equal((await call(`${path}/messages`, { clientId: 'other-client-1234567890', text: '20 cali' })).status, 404);
  const next = await call(`${path}/messages`, { clientId, text: '18 cali' });
  assert.equal(next.status, 202);
  assert.equal(next.body.canApply, false);
  assert.equal((await call(`${path}/messages`, { clientId, text: '16 cali' })).status, 409);
  finish();
  const final = await call(`${path}?clientId=${clientId}`);
  assert.equal(final.body.status, 'complete');
  assert.deepEqual(captured[1].filter(message => message.role === 'user').map(message => message.text), ['Cameleon', '18 cali']);
  assert.equal(final.body.messages.length, 4);
  assert.equal(final.body.equipment.widthCm, 64);
  assert.equal(final.body.clientId, undefined);
});

test('failed replies keep context and can be retried without duplicating the user turn', async () => {
  let attempts = 0;
  const call = await service(async messages => {
    if (++attempts === 1) throw new Error('private-provider-error');
    assert.equal(messages.length, 1);
    return normalizeConversation(raw, [url], messages, 'manual');
  });
  const { body } = await call('/equipment/research', { kind: 'manual', query: 'Cameleon 18 cali', clientId, conversational: true });
  const path = `/equipment/research/${body.id}`;
  const failure = (await call(`${path}?clientId=${clientId}`)).body;
  assert.equal(failure.status, 'failed');
  assert.equal(failure.messages.length, 1);
  assert.equal(JSON.stringify(failure).includes('private-provider-error'), false);
  assert.equal((await call(`${path}/messages`, { clientId, retry: true })).status, 202);
  const success = (await call(`${path}?clientId=${clientId}`)).body;
  assert.equal(success.messages.length, 2);
  assert.equal(success.status, 'complete');
});

test('account-owned chats cannot be read or continued by a different account or guest', async () => {
  const call = await service(async messages => normalizeConversation(raw, [url], messages, 'manual'));
  const register = async name => (await call('/auth/register', { email: `${name}@example.test`, password: 'isolated-password-long', displayName: name })).body.token;
  const alice = await register('alice'), bob = await register('bob');
  const { body } = await call('/equipment/research', { kind: 'manual', query: 'Cameleon 18 cali', clientId, conversational: true }, alice);
  const path = `/equipment/research/${body.id}`;
  assert.equal((await call(`${path}?clientId=${clientId}`, undefined, bob)).status, 404);
  assert.equal((await call(`${path}/messages`, { clientId, text: '20 cali' }, bob)).status, 404);
  assert.equal((await call(`${path}/messages`, { clientId, text: '20 cali' })).status, 404);
  assert.equal((await call(`${path}?clientId=${clientId}`, undefined, alice)).status, 200);
});
