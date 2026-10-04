export interface PlaceFilters {
  wheelchair: 'all' | 'yes' | 'limited' | 'no' | 'unknown';
  accessibleToilet: boolean;
  freeOnly: boolean;
  publicOnly: boolean;
  open247: boolean;
  placeType: 'all' | 'bench' | 'parking';
  backrest: boolean;
  armrest: boolean;
  hideUnknown: boolean;
  stepFree: boolean;
}

export interface FilterablePlace {
  category?: string;
  placeType?: string | null;
  access?: { wheelchair?: string | null; toilet?: string | null; stepFree?: boolean | null };
  fee?: string | null;
  accessRestriction?: string | null;
  openingHours?: string | null;
  bench?: { backrest?: string | null; armrest?: string | null } | null;
}

export const DEFAULT_PLACE_FILTERS: Readonly<PlaceFilters>;
export function parsePlaceFilters(query?: URLSearchParams | Record<string, unknown>): PlaceFilters;
export function hasPlaceFilters(filters?: Partial<PlaceFilters>): boolean;
export function placeFiltersParams(filters?: Partial<PlaceFilters>): string;
export function matchesPlaceFilters(place: FilterablePlace, filters?: Partial<PlaceFilters>): boolean;
