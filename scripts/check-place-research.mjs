import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { researchPlace } from '../server/place-research.mjs';
const place = JSON.parse(readFileSync('server/data/places.json', 'utf8')).places.find(p => p.id === 'osm-node-1332080339');
const result = await researchPlace(place);
mkdirSync('artifacts/accessibility', { recursive: true });
writeFileSync('artifacts/accessibility/live-website-research.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify({ status: result.status, identityConfirmed: result.identityConfirmed, facts: result.facts, missing: result.missing, sources: result.sources, errors: result.errors }));
