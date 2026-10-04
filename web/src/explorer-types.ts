import type { Coordinates } from './types';
export type ExplorerReward = { awarded: number; reason: string; badges?: string[]; rankUp?: string | null };
export type ExplorerBadge = { id: string; name: string; detail: string; icon: string; color: string; count: number; level: number; thresholds: number[]; next: number | null };
export type ExplorerState = {
  user: { id: string; displayName: string } | null;
  stats: { xp: number; contributions: number; discoveries: number; refreshes: number; measurements: number; rests: number; entrances: number; variety: number };
  badges: ExplorerBadge[]; featured: string[]; theme: string; themes: { id: string; name: string; xp: number }[];
  rank: { name: string; xp: number }; nextRank: { name: string; xp: number } | null;
  dailyRemaining: number; notice: string;
  recent: { id: string; activity: string; kind: string; points: number; at: string }[];
};
export type ExplorerMission = {
  id: string; type: 'refresh' | 'discover'; kind: string; title: string; reason: string; points: number;
  place: string; address?: string; coordinates: Coordinates; distanceM: number; sourceUrl: string | null;
  lastObservedAt: string | null; reportId?: string; description?: string; revision?: string;
};
