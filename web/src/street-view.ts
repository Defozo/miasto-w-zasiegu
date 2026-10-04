import type { Coordinates, Route } from "./types";

export interface StreetViewPoint {
  coordinates: Coordinates;
  heading?: number;
}

function validPoint(point: Coordinates | undefined): point is Coordinates {
  return Boolean(
    point &&
    Number.isFinite(point[0]) &&
    Number.isFinite(point[1]) &&
    Math.abs(point[0]) <= 180 &&
    Math.abs(point[1]) <= 90,
  );
}

function bearing(from: Coordinates, to: Coordinates): number | undefined {
  if (from[0] === to[0] && from[1] === to[1]) return undefined;
  const radians = Math.PI / 180;
  const latitude1 = from[1] * radians,
    latitude2 = to[1] * radians;
  const longitude = (to[0] - from[0]) * radians;
  const y = Math.sin(longitude) * Math.cos(latitude2);
  const x =
    Math.cos(latitude1) * Math.sin(latitude2) -
    Math.sin(latitude1) * Math.cos(latitude2) * Math.cos(longitude);
  return (Math.atan2(y, x) / radians + 360) % 360;
}

export function streetViewPoint(
  route: Route,
  step: Route["steps"][number],
): StreetViewPoint | null {
  const points = route.geometry.coordinates;
  const [start, end] = step.wayPoints ?? [];
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    end >= points.length ||
    !validPoint(points[start])
  )
    return null;
  const coordinates = points[start];
  // ORS instructions describe the manoeuvre at the start of each step.
  // Look along the outgoing segment, skipping duplicate geometry vertices.
  for (let i = start + 1; i <= end; i++) {
    if (!validPoint(points[i])) continue;
    const heading = bearing(coordinates, points[i]);
    if (heading !== undefined) return { coordinates, heading };
  }
  // The arrival step often contains a single point. Keep the arrival direction.
  for (let i = start - 1; i >= 0; i--) {
    if (!validPoint(points[i])) continue;
    const heading = bearing(points[i], coordinates);
    if (heading !== undefined) return { coordinates, heading };
  }
  return { coordinates };
}

export function streetViewUrls(
  point: StreetViewPoint,
  browserKey?: string | null,
) {
  // GeoJSON uses longitude, latitude; Google URLs use latitude, longitude.
  const location = `${point.coordinates[1]},${point.coordinates[0]}`;
  const camera = new URLSearchParams({ pitch: "0", fov: "80" });
  if (point.heading !== undefined)
    camera.set("heading", point.heading.toFixed(1));
  const external = new URLSearchParams(camera);
  external.set("api", "1");
  external.set("map_action", "pano");
  external.set("viewpoint", location);
  const embed = new URLSearchParams(camera);
  embed.set("location", location);
  embed.set("language", "pl");
  embed.set("region", "PL");
  if (browserKey) embed.set("key", browserKey);
  return {
    external: `https://www.google.com/maps/@?${external}`,
    embed: browserKey
      ? `https://www.google.com/maps/embed/v1/streetview?${embed}`
      : null,
  };
}
