export type PassportCategory = 'culture' | 'food' | 'toilet' | 'transport' | 'outdoors' | 'accommodation' | 'services';
export type PassportFieldKey = 'steps' | 'thresholdCm' | 'widthCm' | 'ramp' | 'lift' | 'surface' | 'toilet' | 'restingPlace' | 'openingHours' | 'assistance' | 'entranceNotes' | 'wheelchair';
export type PassportValue = string | number | null;
export type PassportCoordinates = [number, number];
export interface PassportFieldInput { value: PassportValue; sourceLabel?: string | null; sourceUrl?: string | null; observedAt?: string | null }
export type PassportInputFields = Record<PassportFieldKey, PassportFieldInput>;
export interface PassportContent {
  place: { name: string; category: PassportCategory; address: string; coordinates: PassportCoordinates | null; website: string | null };
  fields: PassportInputFields;
  entrances: { id: string; label: string; coordinates: PassportCoordinates | null; fields: PassportInputFields }[];
}
export interface PassportDraft { id: string; placeId: string; draftVersion: number; baseRevision: number; content: PassportContent; createdAt: string; updatedAt: string }
export interface PassportSiteVerification { host: string; verifiedAt: string; expiresAt: string }
export interface PassportEvidence {
  id: string; value: PassportValue; source: { kind: 'osm' | 'municipal' | 'user'; label: string; url: string | null };
  author: { displayName: string } | null; observedAt: string | null; recordUpdatedAt: string | null;
  publishedAt: string | null; siteVerification: PassportSiteVerification | null;
}
export interface PassportFact { value: PassportValue; status: 'unknown' | 'source-only' | 'unverified' | 'conflict'; evidence: PassportEvidence[] }
export interface PlacePassport {
  placeId: string; revision: number; publishedAt: string | null;
  place: { id: string; name: string; category: PassportCategory; address: string; coordinates: PassportCoordinates; website: string | null };
  fields: Record<PassportFieldKey, PassportFact>;
  entrances: { id: string; label: string; coordinates: PassportCoordinates | null; fields: Record<PassportFieldKey, PassportFact> }[];
  sourcePlace: unknown | null;
  metadataEvidence: Record<string, PassportEvidence[]>;
}
export interface PassportMine { drafts: PassportDraft[]; places: { placeId: string; name: string; revision: number; publishedAt: string }[] }
export interface PassportHistory { placeId: string; revisions: { revision: number; publishedAt: string; author: { displayName: string }; changedFields: string[] }[] }
export interface PassportPublishResult { passport: PlacePassport; draft: PassportDraft }
export interface PassportRevision { placeId: string; revision: number; publishedAt: string; author: { displayName: string }; changedFields: string[]; content: PassportContent }
export const PASSPORT_CATEGORIES: readonly { value: PassportCategory; label: string }[];
export const PASSPORT_FIELD_DEFINITIONS: readonly { key: PassportFieldKey; label: string; type: 'choice' | 'number' | 'text'; unit?: string; min?: number; max?: number }[];
export const PASSPORT_CHOICE_OPTIONS: readonly { value: '' | 'yes' | 'no' | 'limited'; label: string }[];
export const PASSPORT_MAX_ENTRANCES: number;
export function emptyPassportFields(): PassportInputFields;
export function emptyPassportContent(): PassportContent;
