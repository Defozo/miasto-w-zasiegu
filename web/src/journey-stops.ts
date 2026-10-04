import type { LocationPoint } from "./types";

// Nearby mapped objects can have separate IDs. Avoid accidentally adding the
// same physical stop again without treating an entire street as one location.
export function alreadyOnJourney(
  point: LocationPoint,
  locations: (LocationPoint | null)[],
) {
  return locations.some((other) => {
    if (!other) return false;
    if (other.id === point.id) return true;
    const latitude =
      (((point.coordinates[1] + other.coordinates[1]) / 2) * Math.PI) / 180;
    const dx =
      (point.coordinates[0] - other.coordinates[0]) *
      111320 *
      Math.cos(latitude);
    const dy = (point.coordinates[1] - other.coordinates[1]) * 111320;
    return Math.hypot(dx, dy) < 15;
  });
}
