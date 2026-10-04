import type { Profile } from "./types";

export function profileHasChanges(draft: Profile, saved: Profile) {
  return (
    draft.mobility !== saved.mobility ||
    draft.widthCm !== saved.widthCm ||
    draft.maxIncline !== saved.maxIncline ||
    draft.maxKerbCm !== saved.maxKerbCm ||
    draft.avoidUnpaved !== saved.avoidUnpaved
  );
}
