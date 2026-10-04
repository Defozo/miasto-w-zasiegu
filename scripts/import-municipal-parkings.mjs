import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncMunicipalParkings } from '../server/municipal-parkings.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.length && !(args.length === 2 && args[0] === '--output')) throw new Error('Użycie: node scripts/import-municipal-parkings.mjs [--output ścieżka.json]');
const path = args.length ? resolve(args[1]) : resolve(root, 'server/data/municipal-parkings.json');
const result = await syncMunicipalParkings({ path });
console.log(JSON.stringify({ path, ...result.sync, places: result.places.length }, null, 2));
if (result.sync.status !== 'success') process.exitCode = 1;
