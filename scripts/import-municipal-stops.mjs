import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncMunicipalStops } from '../server/municipal-stops.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.length && !(args.length === 2 && args[0] === '--output')) {
  console.error('Użycie: node scripts/import-municipal-stops.mjs [--output ścieżka.json]');
  process.exitCode = 2;
} else {
  try {
    const path = args.length ? resolve(args[1]) : resolve(root, 'server/data/municipal-stops.json');
    const result = await syncMunicipalStops({ path });
    console.log(JSON.stringify({ path, ...result.sync, places: result.places.length }, null, 2));
    if (result.sync.status !== 'success') process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ status: 'error', code: error.code ?? 'IMPORT_FAILED',
      message: error.name === 'MunicipalSyncError' ? error.message : 'Nie udało się zapisać miejskich danych przystanków.' }));
    process.exitCode = 1;
  }
}
