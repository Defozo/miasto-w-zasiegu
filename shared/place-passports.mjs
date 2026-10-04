export const PASSPORT_CATEGORIES = Object.freeze([
  { value: 'culture', label: 'Kultura' },
  { value: 'food', label: 'Gastronomia' },
  { value: 'toilet', label: 'Toaleta' },
  { value: 'transport', label: 'Transport' },
  { value: 'outdoors', label: 'Na zewnątrz' },
  { value: 'accommodation', label: 'Nocleg' },
  { value: 'services', label: 'Usługi' },
]);

export const PASSPORT_FIELD_DEFINITIONS = Object.freeze([
  { key: 'steps', label: 'Schody', type: 'choice' },
  { key: 'thresholdCm', label: 'Wysokość progu', type: 'number', unit: 'cm', min: 0, max: 100 },
  { key: 'widthCm', label: 'Szerokość przejścia', type: 'number', unit: 'cm', min: 1, max: 1000 },
  { key: 'ramp', label: 'Podjazd', type: 'choice' },
  { key: 'lift', label: 'Winda', type: 'choice' },
  { key: 'surface', label: 'Nawierzchnia', type: 'text' },
  { key: 'toilet', label: 'Toaleta dostępna dla wózków', type: 'choice' },
  { key: 'restingPlace', label: 'Miejsce odpoczynku', type: 'choice' },
  { key: 'openingHours', label: 'Godziny dostępu', type: 'text' },
  { key: 'assistance', label: 'Konieczna pomoc obsługi', type: 'choice' },
  { key: 'entranceNotes', label: 'Warunki wejścia i korzystania', type: 'text' },
  { key: 'wheelchair', label: 'Deklarowana dostępność dla wózków', type: 'choice' },
]);

export const PASSPORT_CHOICE_OPTIONS = Object.freeze([
  { value: '', label: 'Nie wiem' },
  { value: 'yes', label: 'Tak' },
  { value: 'no', label: 'Nie' },
  { value: 'limited', label: 'Częściowo / warunkowo' },
]);

export const PASSPORT_MAX_ENTRANCES = 8;

export function emptyPassportFields() {
  return Object.fromEntries(PASSPORT_FIELD_DEFINITIONS.map(({ key }) => [key,
    { value: null, sourceLabel: null, sourceUrl: null, observedAt: null }]));
}

export function emptyPassportContent() {
  return { place: { name: '', category: 'culture', address: '', coordinates: null, website: null },
    fields: emptyPassportFields(), entrances: [] };
}
