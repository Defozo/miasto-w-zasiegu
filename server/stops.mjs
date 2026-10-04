import { distance } from "./routing.mjs";
import { formatOpeningHours } from "../shared/opening-hours.mjs";

export const STOP_BUFFER_METRES = 200;
const MAX_SUGGESTIONS = 6;
const DISTANCE_NOTICE =
  "Odległość w linii prostej od trasy, nie długość dojazdu. Dojazd do miejsca wymaga osobnego wyznaczenia.";
const ACCESS_NOTICE =
  "Nie potwierdzono dostępnego dojścia ani przydatności miejsca dla Twoich potrzeb.";
const normal = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";
const pointValid = (point) =>
  Array.isArray(point) &&
  point.length === 2 &&
  point.every(Number.isFinite) &&
  point[0] >= 19.75 &&
  point[0] <= 20.25 &&
  point[1] >= 49.9 &&
  point[1] <= 50.2;

// Local tangent plane in metres; each complete segment participates, including
// long edges and legs to intermediate stops. This is proximity, never routing.
function routeDistance(points) {
  const origin = points[0],
    scaleY = (6371008.8 * Math.PI) / 180;
  const scaleX =
    scaleY *
    Math.cos(
      ((points.reduce((sum, p) => sum + p[1], 0) / points.length) * Math.PI) /
        180,
    );
  const project = (p) => [
    (p[0] - origin[0]) * scaleX,
    (p[1] - origin[1]) * scaleY,
  ];
  const projected = points.map(project);
  const segments = projected.slice(1).map((b, i) => {
    const a = projected[i],
      dx = b[0] - a[0],
      dy = b[1] - a[1];
    return {
      a,
      dx,
      dy,
      lengthSquared: dx * dx + dy * dy,
      left: Math.min(a[0], b[0]) - STOP_BUFFER_METRES,
      right: Math.max(a[0], b[0]) + STOP_BUFFER_METRES,
      bottom: Math.min(a[1], b[1]) - STOP_BUFFER_METRES,
      top: Math.max(a[1], b[1]) + STOP_BUFFER_METRES,
    };
  });
  return (point) => {
    const [x, y] = project(point);
    let closest = Infinity;
    for (const s of segments) {
      if (x < s.left || x > s.right || y < s.bottom || y > s.top) continue;
      const t = s.lengthSquared
        ? Math.max(
            0,
            Math.min(
              1,
              ((x - s.a[0]) * s.dx + (y - s.a[1]) * s.dy) / s.lengthSquared,
            ),
          )
        : 0;
      closest = Math.min(
        closest,
        Math.hypot(x - s.a[0] - t * s.dx, y - s.a[1] - t * s.dy),
      );
    }
    return closest;
  };
}

function osmSuggestion(place) {
  const kind =
    place.placeType ?? (place.category === "toilet" ? "toilet" : null);
  if (
    !["bench", "toilet"].includes(kind) ||
    place.coordinateKind !== "osm-node" ||
    !pointValid(place.coordinates)
  )
    return null;
  const restriction = normal(place.accessRestriction),
    wheelchair = place.access?.wheelchair;
  if (
    ["private", "no"].includes(restriction) ||
    wheelchair === "no" ||
    (kind === "toilet" && place.access?.toilet === "no")
  )
    return null;
  const details = [],
    restrictions = [],
    warnings = [DISTANCE_NOTICE, ACCESS_NOTICE];
  if (restriction === "customers")
    restrictions.push(
      "Dostęp tylko dla klientów. Sprawdź warunki korzystania.",
    );
  else if (restriction === "permit")
    restrictions.push(
      "Korzystanie wymaga zezwolenia. Sprawdź warunki dostępu.",
    );
  else if (
    restriction &&
    !["yes", "public", "permissive", "designated"].includes(restriction)
  )
    restrictions.push(
      `Ograniczenie dostępu podane w źródle: ${place.accessRestriction}.`,
    );
  else if (!restriction) warnings.push("Brak danych o zasadach dostępu.");
  if (wheelchair === "yes")
    details.push(
      "Mapa oznacza możliwość korzystania na wózku; brak niezależnego potwierdzenia.",
    );
  else if (wheelchair === "limited")
    restrictions.push("Mapa wskazuje ograniczoną dostępność na wózku.");
  else warnings.push("Brak danych o dostępności na wózku.");
  warnings.push(...restrictions);
  const openingHours = formatOpeningHours(place.openingHours);
  if (openingHours)
    details.push(
      `${openingHours.startsWith("Zapis źródłowy:") ? "Godziny. " : "Godziny według źródła: "}${openingHours}${openingHours.endsWith(".") ? "" : "."} Nie sprawdzono, czy miejsce jest teraz otwarte.`,
    );
  else if (kind === "toilet")
    warnings.push("Brak danych o godzinach otwarcia.");
  if (normal(place.fee) === "yes")
    details.push("Według źródła korzystanie jest płatne.");
  else if (normal(place.fee) === "no")
    details.push("Według źródła korzystanie jest bezpłatne.");
  else if (place.fee) details.push(`Opłaty według źródła: ${place.fee}.`);
  else if (kind === "toilet") warnings.push("Brak danych o opłatach.");
  if (kind === "bench") {
    const backrest = normal(place.bench?.backrest),
      armrest = normal(place.bench?.armrest);
    details.push(
      `Oparcie: ${backrest === "yes" ? "tak" : backrest === "no" ? "nie" : "brak pewnych danych"}.`,
    );
    details.push(
      `Podłokietniki: ${armrest === "yes" ? "tak" : armrest === "no" ? "nie" : /^\d+$/.test(armrest) ? armrest : "brak pewnych danych"}.`,
    );
    warnings.push(
      "Brak potwierdzenia miejsca obok ławki i możliwości przesiadania się.",
    );
  }
  if (kind !== "bench" && place.access?.entranceNotes)
    details.push(place.access.entranceNotes);
  return {
    id: place.id,
    kind,
    point: {
      id: place.id,
      label: place.name,
      coordinates: place.coordinates,
      kind: "place",
      precision: "approximate",
      sourceLabel: place.sourceLabel,
    },
    sourceLabel: place.sourceLabel,
    sourceUrl: place.sourceUrl ?? null,
    dataUpdatedAt: place.osmUpdatedAt ?? null,
    openingHoursSource: place.openingHours ?? null,
    observedAt: null,
    validUntil: null,
    details,
    restrictions,
    warnings,
  };
}

export function createStopSuggestions({ store, db, now = Date.now }) {
  // The imported snapshot is fixed for this app instance. Observations stay live.
  const places = store.places().map(osmSuggestion).filter(Boolean);
  const observations = db.prepare(
    "SELECT id,lon,lat,description,observed_at,valid_until FROM observations WHERE type='rest_place' AND status='active' AND valid_until>? AND observed_at<=? AND lon BETWEEN ? AND ? AND lat BETWEEN ? AND ?",
  );
  return (route, plannedPoints = []) => {
    const points = route.geometry?.coordinates;
    if (
      route.geometry?.type !== "LineString" ||
      !Array.isArray(points) ||
      points.length < 2 ||
      !points.every(pointValid)
    )
      return [];
    const currentTime = now(),
      timestamp = new Date(currentTime).toISOString();
    let minLon = Infinity,
      maxLon = -Infinity,
      minLat = Infinity,
      maxLat = -Infinity;
    for (const point of points) {
      minLon = Math.min(minLon, point[0]);
      maxLon = Math.max(maxLon, point[0]);
      minLat = Math.min(minLat, point[1]);
      maxLat = Math.max(maxLat, point[1]);
    }
    const marginLat = STOP_BUFFER_METRES / 111000,
      marginLon = marginLat / Math.cos((maxLat * Math.PI) / 180);
    const community = observations
      .all(
        timestamp,
        timestamp,
        minLon - marginLon,
        maxLon + marginLon,
        minLat - marginLat,
        maxLat + marginLat,
      )
      .filter(
        (row) =>
          Number.isFinite(Date.parse(row.observed_at)) &&
          Date.parse(row.valid_until) > currentTime,
      )
      .map((row) => ({
        id: `observation-${row.id}`,
        kind: "rest_place",
        point: {
          id: `observation-${row.id}`,
          label: "Miejsce odpoczynku",
          coordinates: [row.lon, row.lat],
          kind: "place",
          precision: "approximate",
          sourceLabel: "Obserwacja mieszkańca",
        },
        sourceLabel: "Obserwacja społeczności · niezweryfikowana terenowo",
        sourceUrl: null,
        dataUpdatedAt: null,
        openingHoursSource: null,
        observedAt: row.observed_at,
        validUntil: row.valid_until,
        details: [row.description],
        restrictions: [],
        warnings: [
          DISTANCE_NOTICE,
          ACCESS_NOTICE,
          "Własna obserwacja mieszkańca, bez niezależnego potwierdzenia.",
        ],
      }));
    const measure = routeDistance(points);
    const candidates = [...places, ...community]
      .flatMap((candidate) => {
        const point = candidate.point.coordinates;
        if (
          !pointValid(point) ||
          point[0] < minLon - marginLon ||
          point[0] > maxLon + marginLon ||
          point[1] < minLat - marginLat ||
          point[1] > maxLat + marginLat ||
          plannedPoints.some(
            (stop) => pointValid(stop) && distance(stop, point) < 15,
          )
        )
          return [];
        const metres = measure(point);
        return metres <= STOP_BUFFER_METRES
          ? [{ ...candidate, distanceFromRouteMeters: Math.round(metres) }]
          : [];
      })
      .sort(
        (a, b) =>
          a.distanceFromRouteMeters - b.distanceFromRouteMeters ||
          a.id.localeCompare(b.id),
      );
    // Nearby benches must not crowd every toilet and community observation out.
    const selected = [],
      selectedIds = new Set();
    for (const kind of ["bench", "toilet", "rest_place"])
      for (const candidate of candidates
        .filter((row) => row.kind === kind)
        .slice(0, 2)) {
        selected.push(candidate);
        selectedIds.add(candidate.id);
      }
    for (const candidate of candidates) {
      if (selected.length >= MAX_SUGGESTIONS) break;
      if (!selectedIds.has(candidate.id)) {
        selected.push(candidate);
        selectedIds.add(candidate.id);
      }
    }
    return selected.sort(
      (a, b) =>
        a.distanceFromRouteMeters - b.distanceFromRouteMeters ||
        a.id.localeCompare(b.id),
    );
  };
}
