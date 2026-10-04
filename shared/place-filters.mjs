export const DEFAULT_PLACE_FILTERS = Object.freeze({
  wheelchair: 'all',
  accessibleToilet: false,
  freeOnly: false,
  publicOnly: false,
  open247: false,
  placeType: 'all',
  backrest: false,
  armrest: false,
  hideUnknown: false,
  stepFree: false,
});

const WHEELCHAIR_VALUES = new Set(['all', 'yes', 'limited', 'no', 'unknown']);
const PLACE_TYPES = new Set(['all', 'bench', 'parking']);
const BOOLEAN_FILTERS = ['accessibleToilet', 'freeOnly', 'publicOnly', 'open247', 'backrest', 'armrest', 'hideUnknown', 'stepFree'];
const PUBLIC_ACCESS = new Set(['yes', 'public', 'permissive']);
const KNOWN_WHEELCHAIR = new Set(['yes', 'limited', 'no']);

function queryValue(query, key) {
  const values = query instanceof URLSearchParams
    ? query.getAll(key)
    : Object.hasOwn(query, key) ? [query[key]] : [];
  if (values.length === 0) return undefined;
  if (values.length !== 1 || typeof values[0] !== 'string')
    throw new TypeError(`Filtr ${key} musi mieć jedną wartość tekstową.`);
  return values[0];
}

export function parsePlaceFilters(query = {}) {
  const filters = { ...DEFAULT_PLACE_FILTERS };
  for (const [key, allowed] of [['wheelchair', WHEELCHAIR_VALUES], ['placeType', PLACE_TYPES]]) {
    const value = queryValue(query, key);
    if (value === undefined) continue;
    if (!allowed.has(value)) throw new TypeError(`Niepoprawna wartość filtra ${key}.`);
    filters[key] = value;
  }
  for (const key of BOOLEAN_FILTERS) {
    const value = queryValue(query, key);
    if (value === undefined) continue;
    if (value !== 'true' && value !== 'false')
      throw new TypeError(`Filtr ${key} przyjmuje true albo false.`);
    filters[key] = value === 'true';
  }
  return filters;
}

export function hasPlaceFilters(filters = DEFAULT_PLACE_FILTERS) {
  return Object.entries(DEFAULT_PLACE_FILTERS).some(([key, value]) =>
    filters[key] !== undefined && filters[key] !== value);
}

export function placeFiltersParams(filters = DEFAULT_PLACE_FILTERS) {
  const params = new URLSearchParams();
  for (const [key, defaultValue] of Object.entries(DEFAULT_PLACE_FILTERS)) {
    if (filters[key] !== undefined && filters[key] !== defaultValue)
      params.set(key, String(filters[key]));
  }
  return params.toString();
}

export function matchesPlaceFilters(place, filters = DEFAULT_PLACE_FILTERS) {
  if (filters.placeType === 'parking' && place.placeType !== 'parking') return false;
  const wheelchair = KNOWN_WHEELCHAIR.has(place.access?.wheelchair) ? place.access.wheelchair : 'unknown';
  if (filters.hideUnknown && wheelchair === 'unknown') return false;
  if (filters.stepFree && place.access?.stepFree !== true) return false;
  if (filters.wheelchair && filters.wheelchair !== 'all' && wheelchair !== filters.wheelchair) return false;

  if (filters.accessibleToilet) {
    const toilet = place.access?.toilet;
    // Conflicting or limited access never counts as a declaration of full access.
    if (wheelchair === 'no' || wheelchair === 'limited' || toilet === 'no' || toilet === 'limited') return false;
    if (toilet !== 'yes' && !(place.category === 'toilet' && wheelchair === 'yes')) return false;
  }

  if (filters.freeOnly && place.fee !== 'no') return false;
  if (filters.publicOnly && !PUBLIC_ACCESS.has(place.accessRestriction)) return false;
  if (filters.open247 && place.openingHours !== '24/7') return false;

  if ((filters.placeType === 'bench' || filters.backrest || filters.armrest) && place.placeType !== 'bench') return false;
  if (filters.backrest && place.bench?.backrest !== 'yes') return false;
  if (filters.armrest && place.bench?.armrest !== 'yes') return false;
  return true;
}
