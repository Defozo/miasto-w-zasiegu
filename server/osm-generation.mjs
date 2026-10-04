import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const OSM_FILES = ['places.json', 'parkings.json', 'parking-access.json', 'locations.json', 'accessibility.json', 'accessibility.sqlite'];

// All related layers resolve once per process from a single atomic pointer.
// The previous directory remains available for rollback and existing readers.
export function osmGeneration(dataDirectory) {
  const pointer = resolve(dataDirectory, 'osm-current.json');
  if (!existsSync(pointer)) return { directory: dataDirectory, generation: null };
  const data = JSON.parse(readFileSync(pointer, 'utf8'));
  if (data.schemaVersion !== 1 || !/^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}$/.test(data.generation))
    throw new Error('Invalid OSM generation pointer');
  const directory = resolve(dataDirectory, 'osm-generations', data.generation);
  if (OSM_FILES.some(file => !existsSync(resolve(directory, file)))) throw new Error('Incomplete OSM generation');
  return { directory, generation: data.generation };
}
