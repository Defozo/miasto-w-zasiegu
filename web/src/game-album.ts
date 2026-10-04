import type { GardenView } from "./GameGarden";

export const ALBUM_LIMIT = 3;
export const ALBUM_PREFIX = "iskry-miasta-album-v1:";
const ITEMS = ["flowers", "lantern", "pond", "tree"];
const KINDS = ["rest_place", "step_free_entrance"];
export type GardenSnapshot = {
  growth: number;
  kinds: string[];
  decorations: { slot: number; itemId: string }[];
};
export type Postcard = {
  slot: number;
  name: string;
  savedAt: string;
  garden: GardenSnapshot;
};

export function albumKey(context: string) {
  return ALBUM_PREFIX + encodeURIComponent(context);
}
export function postcardName(value: string) {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

// Store only the paint needed by the illustration, never a restorable player profile.
export function gardenSnapshot(value: GardenView): GardenSnapshot {
  const earned = Number.isFinite(value.earned) ? value.earned : 0;
  return {
    growth:
      earned >= 75
        ? 75
        : earned >= 40
          ? 40
          : earned >= 15
            ? 15
            : earned > 0
              ? 1
              : 0,
    kinds: KINDS.filter((kind) => value.kinds.includes(kind)),
    decorations: value.decorations
      .filter(
        (item, index, all) =>
          Number.isInteger(item.slot) &&
          item.slot >= 0 &&
          item.slot < 4 &&
          ITEMS.includes(item.itemId) &&
          all.findIndex((other) => other.slot === item.slot) === index,
      )
      .map(({ slot, itemId }) => ({ slot, itemId })),
  };
}

export function snapshotView(value: GardenSnapshot): GardenView {
  return {
    earned: value.growth,
    kinds: value.kinds,
    decorations: value.decorations,
  };
}

export function readAlbum(key: string): Postcard[] {
  // Storage may be disabled, edited manually or left by an older prototype.
  const raw = localStorage.getItem(key);
  if (!raw || raw.length > 32_000) return [];
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(input)) return [];
  const result: Postcard[] = [];
  for (const item of input.slice(0, 20)) {
    if (
      !item ||
      typeof item !== "object" ||
      !Number.isInteger(item.slot) ||
      item.slot < 0 ||
      item.slot >= ALBUM_LIMIT ||
      result.some((card) => card.slot === item.slot)
    )
      continue;
    if (
      typeof item.name !== "string" ||
      !postcardName(item.name) ||
      typeof item.savedAt !== "string" ||
      !Number.isFinite(Date.parse(item.savedAt))
    )
      continue;
    const garden = item.garden;
    if (
      !garden ||
      typeof garden !== "object" ||
      typeof garden.growth !== "number" ||
      !Array.isArray(garden.kinds) ||
      !Array.isArray(garden.decorations)
    )
      continue;
    const safe = gardenSnapshot({
      earned: garden.growth,
      kinds: garden.kinds.filter(
        (kind: unknown): kind is string => typeof kind === "string",
      ),
      decorations: garden.decorations.filter(
        (decoration: unknown) =>
          decoration &&
          typeof decoration === "object" &&
          "slot" in decoration &&
          "itemId" in decoration &&
          typeof decoration.itemId === "string",
      ),
    });
    result.push({
      slot: item.slot,
      name: postcardName(item.name),
      savedAt: new Date(item.savedAt).toISOString(),
      garden: safe,
    });
  }
  return result.sort((a, b) => a.slot - b.slot);
}
