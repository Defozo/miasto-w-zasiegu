import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { converseEquipment } from '../server/equipment-conversation.mjs';

// Public product lookup only. Does not save presets, catalogue entries or observations.
const messages = [{ role: 'user', text: 'Vitea Care Cameleon VCWK9AC, nie wiem który rozmiar' }];
const turns = [];
try {
  let equipment = null;
  for (let index = 0; index < 2; index++) {
    const result = await converseEquipment(messages, 'power', { equipment });
    equipment = result.equipment;
    turns.push(result);
    console.log(JSON.stringify({ turn: index + 1, message: result.message, question: result.question, suggestions: result.suggestions,
      canApply: result.canApply, kind: result.identifiedKind, widthCm: equipment?.widthCm, variant: equipment?.variant }));
    messages.push({ role: 'assistant', text: [result.message, result.question].filter(Boolean).join('\n\n') });
    if (!index) {
      assert.equal(result.canApply, false);
      assert.equal(equipment?.widthCm ?? null, null);
      messages.push({ role: 'user', text: 'Tak, to mój wózek ręczny bez napędu elektrycznego. Na etykiecie jest rozmiar 18 cali.' });
    }
  }
  await writeFile('artifacts/equipment-conversation-live.json', JSON.stringify({ checkedAt: new Date().toISOString(), messages, turns }, null, 2));
  assert.equal(turns[1].identifiedKind, 'manual');
  assert.equal(turns[1].canApply, true);
  assert.equal(turns[1].equipment?.widthCm, 64);
  console.log('Live conversation passed: category clarified, 18-inch variant resolved to documented 64 cm.');
} catch (error) {
  await writeFile('artifacts/equipment-conversation-live.json', JSON.stringify({ checkedAt: new Date().toISOString(), messages, turns, error: error.message }, null, 2));
  console.error(error.message); process.exitCode = 1;
}
