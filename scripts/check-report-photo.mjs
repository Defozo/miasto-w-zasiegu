// Uses a public-domain reference photo only. Does not create any report or account.
import { readFileSync, writeFileSync } from 'node:fs';
import { prepareReportImage, analyzeReportPhoto } from '../server/report-photo.mjs';
const image = await prepareReportImage(`data:image/jpeg;base64,${readFileSync('artifacts/report-photo/real-ramp.jpg').toString('base64')}`);
const started = Date.now();
const result = await analyzeReportPhoto(image);
if (!result.observations.some(item => ['kerb', 'ramp'].includes(item.kind))) throw new Error('Reference ramp was not identified; inspect model behavior.');
const evidence = { checkedAt: new Date().toISOString(), durationMs: Date.now() - started,
  model: process.env.REPORT_VISION_MODEL || 'gpt-6.1-sol', source: JSON.parse(readFileSync('artifacts/report-photo/real-ramp-source.json', 'utf8')),
  result, createdReports: 0, limitation: 'Single reference photo integration check; not a recognition benchmark or field audit.' };
writeFileSync('artifacts/report-photo/live-model-validation.json', JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ checkedAt: evidence.checkedAt, durationMs: evidence.durationMs, result, createdReports: 0 }, null, 2));
