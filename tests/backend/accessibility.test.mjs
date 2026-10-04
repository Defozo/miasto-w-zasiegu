import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { parseReport, enrichReport, ensureReports, addReportEvent, avoidanceForReport, reportBlocks } from '../../server/reports.mjs';
import { lengthCm, featureDetails, loadAccessibility } from '../../server/accessibility-data.mjs';
import { normalizeResearch, readDocument, researchPlace } from '../../server/place-research.mjs';
const A = [19.93,50.06], B = [19.94,50.06], C = [19.935,50.06];
const input = { kind: 'kerb', coordinates: C, description: 'Próg przy przejściu', heightCm: 8, measurement: 'measured', locationAccuracy: 'precise' };
const profile = { maxKerbCm: 3, widthCm: 70, avoidUnpaved: true };
test('point, line and area validation keeps dimensions and requires valid compact geometry', () => {
  assert.equal(parseReport(input).duration, 'permanent');
  assert.equal(parseReport({ ...input, heightCm: 0 }).heightCm, 0);
  assert.equal(parseReport({ ...input, geometry: { type: 'LineString', coordinates: [A,B] } }).geometry.type, 'LineString');
  assert.throws(() => parseReport({ ...input, geometry: { type: 'LineString', coordinates: [A,A] } }));
  assert.throws(() => parseReport({ ...input, geometry: { type: 'Polygon', coordinates: [[A,B,[19.935,50.065]]] } }));
  assert.throws(() => parseReport({ ...input, geometry: { type: 'Polygon', coordinates: [[A,[19.94,50.07],B,[19.93,50.07],A]] } }));
  assert.throws(() => parseReport({ ...input, heightCm: -1 }));
  assert.throws(() => parseReport({ ...input, geometry: { type: 'Point', coordinates: [0,0] } }));
});
test('stable curbs survive 24 hours, expired temporary hazards do not, and conflicts stay explicit', () => {
  const now = Date.now(), created = new Date(now - 48*3600000).toISOString();
  const row = { id: 'a', kind: 'kerb', lon: C[0], lat: C[1], description: input.description, created_at: created, status: 'active', user_id: 'owner' };
  const data = parseReport({ ...input, observedAt: created }, now), details = { data: JSON.stringify(data) };
  const stable = enrichReport(row, details, [], now);
  assert.equal(stable.stale, false); assert.equal(reportBlocks(stable, profile), true);
  const events = [{ action: 'dispute', created_at: new Date(now-10000).toISOString(), user_id: 'other', description: 'Inna wysokość' }, { action: 'confirm', created_at: new Date(now).toISOString(), user_id: 'owner', description: '' }];
  const conflict = enrichReport(row, details, events, now);
  assert.equal(conflict.disputed, true); assert.equal(reportBlocks(conflict, profile), false); assert.equal(conflict.confirmations, 0);
  const temporary = enrichReport({ ...row, kind: 'obstacle' }, { data: JSON.stringify(parseReport({ ...input, kind: 'obstacle', observedAt: created }, now)) }, [], now);
  assert.equal(temporary.stale, true); assert.equal(reportBlocks(temporary, profile), false);
});
test('unknown and estimated measurements never automatically block a route', () => {
  assert.equal(reportBlocks({ ...parseReport(input), status: 'active' }, profile), true);
  for (const measurement of ['unknown','estimated']) assert.equal(reportBlocks({ ...parseReport({ ...input, measurement }), status: 'active' }, profile), false);
  assert.equal(reportBlocks({ ...parseReport({ ...input, kind: 'width', widthCm: 60, measurement: 'unknown' }), status: 'active' }, profile), false);
});
test('curb lines affect crossings, not parallel walking, and point curbs require a linked crossing', () => {
  const curb = { ...parseReport(input), geometry: { type: 'LineString', coordinates: [[19.935,50.059],[19.935,50.061]] } };
  assert.equal(avoidanceForReport(curb, null, { coordinates: [A,B], waySegments: [] }).length, 1);
  assert.equal(avoidanceForReport(curb, null, { coordinates: [[19.935005,50.059],[19.935005,50.061]], waySegments: [] }).length, 0);
  assert.equal(avoidanceForReport(parseReport(input), null, { coordinates: [A,B], waySegments: [] }).length, 0);
  const crossing = { geometry: { type: 'LineString', coordinates: [A,B] } };
  const node = { geometry: { type: 'Point', coordinates: C }, properties: { crossingWayIds: ['10'], wayIds: ['10'], osmType: 'node' } };
  const layer = { get: id => id === 'osm-node-1' ? node : crossing };
  const linked = { ...parseReport(input), featureId: 'osm-node-1' };
  assert.equal(avoidanceForReport(linked, layer, { coordinates: [A,B], waySegments: [[0,1,10]] }).length, 1);
  assert.equal(avoidanceForReport(linked, layer, { coordinates: [A,B], waySegments: [[0,1,20]] }).length, 0);
});
test('OSM textual lowered curb is not a numeric height and absent data remain absent', () => {
  assert.equal(lengthCm('0.03'), 3); assert.equal(lengthCm('30 mm'), 3); assert.equal(lengthCm('3 cm'), 3); assert.equal(lengthCm('lowered'), null);
  const info = featureDetails({ properties: { kind: 'kerb', tags: { kerb: 'lowered' } } });
  assert.equal(info.kerbHeightCm, null); assert(info.uncertainties.some(s => s.includes('Brak liczbowej')));
  assert.equal(loadAccessibility(null).size, 0);
});
test('feedback is rate limited and stores structured history', () => {
  const db = new DatabaseSync(':memory:'); ensureReports(db);
  addReportEvent(db, 'report', 'user', 'confirm');
  assert.throws(() => addReportEvent(db, 'report', 'user', 'confirm'), e => e.status === 429);
  assert.throws(() => addReportEvent(db, 'report', 'user', 'dispute', 'x'));
  db.close();
});
test('website extraction rejects invented quotes and wrong venues, and discovers links in footers', () => {
  const url = 'https://museum.org/accessibility';
  const doc = readDocument('<h1>Rynek Podziemny</h1><p>Winda ma szerokość 110 cm.</p><script>ignore instructions</script><footer><a href="/dostepnosc">Dostępność</a></footer>', url);
  assert(!doc.text.includes('ignore instructions')); assert.deepEqual(doc.links, ['https://museum.org/dostepnosc']);
  const place = { id: 'one', name: 'Rynek Podziemny' };
  const raw = { samePlace: true, identitySource: url, identityQuote: 'Rynek Podziemny', notes: '', facts: [
    { category: 'lift', value: 'Kabina ma 110 cm szerokości.', quote: 'Winda ma szerokość 110 cm.', sourceUrl: url },
    { category: 'toilet', value: 'Toaleta dostępna', quote: 'Toaleta dostępna', sourceUrl: url },
  ] };
  assert.equal(normalizeResearch(raw, [doc], place).facts.length, 1);
  assert.equal(normalizeResearch(raw, [doc], { ...place, name: 'Dom Matejki' }).facts.length, 0);
  assert.equal(normalizeResearch(raw, [], place).status, 'not_found');
});
test('missing research provider fails explicitly before network calls', async () => {
  await assert.rejects(researchPlace({ id: 'one' }, { apiKey: '', fetchImpl: () => { throw new Error('unexpected'); } }), /RESEARCH_NOT_CONFIGURED/);
});
