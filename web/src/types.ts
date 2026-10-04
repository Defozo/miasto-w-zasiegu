export type Coordinates = [number, number];
export type ObservationGeometry = { type: "Point"; coordinates: Coordinates } | { type: "LineString"; coordinates: Coordinates[] } | { type: "Polygon"; coordinates: Coordinates[][] };
export interface AccessibilityFeature {
  type: "Feature"; id: string; geometry: ObservationGeometry;
  properties: { kind: string; title: string; details: string[]; uncertainties: string[]; sourceUrl: string; updatedAt: string | null; tags: Record<string, string>; kerbHeightCm: number | null; widthCm: number | null };
}
export interface RouteFact {
  id: string; kind: string; title: string; details: string[]; uncertainties: string[]; geometry: ObservationGeometry;
  distanceAlongM: number; sourceUrl: string | null; sourceLabel: string; updatedAt: string | null; verification: string; applicability: "route" | "nearby";
}
export type Category =
  | "all"
  | "culture"
  | "food"
  | "toilet"
  | "transport"
  | "outdoors"
  | "accommodation"
  | "services";
export interface Place {
  promotion?: { label: string; advertiser: string; recommendation: boolean };
  id: string;
  name: string;
  category: Exclude<Category, "all">;
  coordinates: Coordinates;
  description: string;
  address: string;
  access: {
    wheelchair: "yes" | "limited" | "no" | "unknown";
    widthCm: number | null;
    surface: string | null;
    toilet: "yes" | "limited" | "no" | "unknown";
    entranceNotes: string;
    thresholdCm?: number | null;
    stepFree?: boolean | null;
  };
  sourceUrl: string;
  verifiedAt: string | null;
  sourceLabel: string;
  passportRevision?: number;
  passportUrl?: string;
  location?: LocationPoint;
  coordinateKind?: "osm-node" | "representative-center" | "source-point";
  osmUpdatedAt?: string | null;
  placeType?: "bench" | "toilet" | "park" | "transit_stop" | "parking" | null;
  parking?: { disabledSpaces: string | null; maxHeight: string | null; capacity: string | null; type: string | null } | null;
  accessRestriction?: string | null;
  openingHours?: string | null;
  fee?: string | null;
  bench?: { backrest: string | null; armrest: string | null } | null;
  provenance?: {
    datasetId: string;
    publisher: string;
    datasetUrl: string;
    recordUrl: string;
    recordId?: string;
    recordUpdatedAt: string | null;
    fetchedAt?: string | null;
    importedAt?: string | null;
    snapshotAt?: string | null;
    sourceUpdatedAt?: string | null;
    termsUrl: string;
    attribution?: string;
    verification: "source-only";
    syncStatus?: "success" | "error" | "missing";
    stale?: boolean;
  };
  municipalFacts?: {
    stopCode: string | null;
    stopType: string | null;
    platformSurface: string | null;
    kerbType: string | null;
    benchesOutsideShelter: number | null;
    shelters: number | null;
    validFrom: string | null;
    validUntil: string | null;
  };
  relatedSources?: NonNullable<Place["provenance"]>[];
  municipalParkingSource?: Place["provenance"];
  municipalParkingFacts?: { capacity: number | null; disabledSpaces: number | null; electricSpaces: number | null; operatingHours: string | null; informationPhone: string | null };
  dataConflicts?: { field: string; osm: string; municipal: string }[];
}
export type MapPlace = Pick<Place, "id" | "name" | "category" | "coordinates" | "promotion"> & {
  municipalFacts?: Pick<NonNullable<Place["municipalFacts"]>, "stopCode">;
};
export interface MunicipalDataStatus {
  status: "success" | "error" | "missing";
  available?: boolean;
  lastAttemptAt?: string | null;
  lastSuccessAt?: string | null;
  stale?: boolean;
}
export interface Profile {
  mobility: "manual" | "power" | "stroller" | "walking";
  widthCm: string;
  maxIncline: string;
  maxKerbCm: string;
  avoidUnpaved: boolean;
}
export type EquipmentKind = "manual" | "power" | "walker" | "stroller" | "walking";
export interface EquipmentParameter {
  label: string; value: string; sourceUrl: string; quote: string;
  origin?: "measurement" | "documentation"; checkedAt?: string;
}
export interface Equipment {
  name: string; manufacturer: string; variant?: string; parameters: EquipmentParameter[];
}
export interface MobilityPreset {
  id: string; name: string; kind: EquipmentKind; profile: Profile; equipment: Equipment | null;
}
export interface PresetDocument {
  presets: MobilityPreset[]; activePresetId: string | null; usesCar: boolean; version: number;
}
export interface EquipmentJob {
  id: string; kind: EquipmentKind; status: "searching" | "needs_choice" | "needs_reply" | "complete" | "not_found" | "failed";
  phase: string; message: string;
  conversational?: boolean;
  messages?: { id: string; role: "user" | "assistant"; text: string }[];
  suggestions?: string[];
  question?: string;
  identifiedKind?: EquipmentKind | null;
  canApply?: boolean;
  candidates?: { name: string; manufacturer: string; reason: string }[];
  equipment?: (Equipment & { widthCm: number | null; widthLabel: string; notes: string; checkedAt: string; sources?: { title: string; url: string }[] }) | null;
}
export interface JourneyAlternative {
  id: string; parking: Place; drive: Route; onward: Route; status: "calculated" | "incomplete";
  transfer: { vehicleEntrance: Coordinates; mobilityExit: Coordinates; alightingPoint: Coordinates | null; status: string; message: string };
  warnings: string[];
}
export interface JourneyResult { alternatives: JourneyAlternative[]; calculatedAt: string; note: string }
export interface Route {
  accessibility?: { events: RouteFact[]; totalEvents: number; truncated: boolean; coverage: { knownSurfaceM: number; unknownSurfaceM: number; routeMatched: boolean }; note: string };
  geometry: { type: "LineString"; coordinates: Coordinates[] };
  distanceM: number;
  durationS: number;
  steps: {
    instruction: string;
    distanceM: number;
    wayPoints: [number, number];
  }[];
  warnings: string[];
  source: Record<string, unknown>;
  reportsAvoided?: number;
  stopSuggestions?: StopSuggestion[];
}
export interface StopSuggestion {
  id: string;
  kind: "bench" | "toilet" | "rest_place";
  point: LocationPoint;
  distanceFromRouteMeters: number;
  sourceLabel: string;
  sourceUrl: string | null;
  dataUpdatedAt: string | null;
  observedAt: string | null;
  validUntil: string | null;
  details: string[];
  warnings: string[];
  restrictions: string[];
}
export interface BarrierReport {
  explorerReward?: import('./explorer-types').ExplorerReward;
  inputMethod?: 'manual' | 'photo-ai';
  photoReviewed?: boolean;
  locationSource?: 'manual' | 'photo-gps' | 'browser';
  id: string;
  kind: "obstacle" | "kerb" | "surface" | "width" | "lift" | "steps" | "ramp" | "entrance" | "rest_place" | "toilet";
  geometry?: ObservationGeometry;
  duration?: "permanent" | "temporary" | "unknown";
  observedAt?: string;
  validUntil?: string | null;
  lastConfirmedAt?: string;
  measurement?: "measured" | "estimated" | "unknown";
  locationAccuracy?: "precise" | "approximate";
  featureId?: string | null;
  kerbType?: string;
  heightCm?: number | null;
  inclinePercent?: number | null;
  surface?: string | null;
  side?: string;
  effect?: "barrier" | "facility" | "information";
  disputed?: boolean;
  confirmations?: number;
  history?: { action: string; description: string; observedAt: string }[];
  coordinates: Coordinates;
  description: string;
  widthCm: number | null;
  status: "active" | "resolved";
  createdAt: string;
  resolvedAt: string | null;
  ageHours: number;
  stale: boolean;
  sourceLabel: string;
  isMine?: boolean;
  canResolve?: boolean;
}
export interface Wheelchair {
  id: string;
  name: string;
  manufacturer: string;
  status: "match" | "conflict" | "insufficient" | "discovered";
  widthLabel: string;
  widthCm: number | null;
  sourceUrl: string;
  manufacturerSourceUrl: string;
  notes: unknown;
  checkedAt?: string;
  parameters?: {
    label: string;
    value: string;
    sourceUrl: string;
    quote: string;
  }[];
  sources?: { title: string; url: string }[];
}
export interface SavedRoute {
  scope: "account" | "device";
  ownerId: string | null;
  route: Route;
  place: Place;
  start: Coordinates;
  startLabel: string;
  profile: Profile;
  savedAt: string;
  waypoints?: LocationPoint[];
}
export interface LocationPoint {
  id: string;
  label: string;
  coordinates: Coordinates;
  kind: "address" | "place" | "street";
  precision: "address" | "approximate";
  sourceLabel?: string;
  sourceUrl?: string;
  coordinateKind?: Place["coordinateKind"];
  disambiguationHint?: string;
}
export interface AccountState {
  user: { id: string; email: string; displayName: string } | null;
  profile: Profile | null;
  profileVersion: number;
}
export interface FavoritePlace {
  id: string;
  label: string;
  point: LocationPoint;
  createdAt: string;
  updatedAt: string;
}
export interface CommunityObservation {
  id: string;
  type: "rest_place" | "step_free_entrance" | "lift_working";
  label: string;
  coordinates: Coordinates;
  description: string;
  observedAt: string;
  validUntil: string;
  status: "active" | "withdrawn";
  isMine: boolean;
  stale: boolean;
}
