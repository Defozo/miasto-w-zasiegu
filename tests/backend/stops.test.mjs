import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { once } from "node:events";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStopSuggestions } from "../../server/stops.mjs";
import { ensureObservationSchema } from "../../server/observations.mjs";
import { createApp } from "../../server/index.mjs";

const NOW = Date.parse("2026-10-03T12:00:00Z");
const M = (6371008.8 * Math.PI) / 180;
const START = [19.9, 50.06],
  END = [19.98, 50.06];
const line = (points) => ({
  geometry: { type: "LineString", coordinates: points },
});
const place = (id, coordinates = [19.94, 50.06], extra = {}) => ({
  id,
  name: "Ławka",
  category: "outdoors",
  placeType: "bench",
  coordinates,
  coordinateKind: "osm-node",
  accessRestriction: "yes",
  openingHours: null,
  fee: null,
  access: { wheelchair: "unknown", toilet: "unknown", entranceNotes: "" },
  description: "Punkt z mapy.",
  address: "",
  bench: { backrest: "yes", armrest: null },
  sourceLabel: "OpenStreetMap · bez audytu terenowego",
  sourceUrl: `https://www.openstreetmap.org/node/${id}`,
  osmUpdatedAt: "2026-01-02T12:00:00Z",
  ...extra,
});

function fixture(t, places = []) {
  const db = new DatabaseSync(":memory:");
  ensureObservationSchema(db);
  t.after(() => db.close());
  const addObservation = (id, extra = {}) => {
    const row = {
      type: "rest_place",
      coordinates: [19.94, 50.06],
      observed: NOW - 1000,
      until: NOW + 1000,
      status: "active",
      ...extra,
    };
    db.prepare(
      "INSERT INTO observations(id,user_id,type,lon,lat,description,description_hash,observed_at,valid_until,status) VALUES(?,?,?,?,?,?,?,?,?,?)",
    ).run(
      id,
      "private-user-id",
      row.type,
      ...row.coordinates,
      "Ławka przy ścieżce, miejsce obok wymaga sprawdzenia.",
      id,
      new Date(row.observed).toISOString(),
      new Date(row.until).toISOString(),
      row.status,
    );
  };
  return {
    db,
    addObservation,
    suggest: createStopSuggestions({
      db,
      store: { places: () => places },
      now: () => NOW,
    }),
  };
}

test("suggestions measure full segment interiors in metres, excluding points outside 200 m", (t) => {
  const { suggest } = fixture(t, [
    place("inside", [19.94, 50.06 + 100 / M]),
    place("outside", [19.94, 50.06 + 201 / M]),
  ]);
  const results = suggest(line([START, END]));
  assert.deepEqual(
    results.map((p) => p.id),
    ["inside"],
  );
  assert.equal(results[0].distanceFromRouteMeters, 100);
  assert(results[0].warnings.some((w) => w.includes("nie długość dojazdu")));
  assert.equal(results[0].dataUpdatedAt, "2026-01-02T12:00:00Z");
  assert.equal(results[0].point.precision, "approximate");
});

test("proximity follows the actual bent route and every via leg, with longitude scaled to latitude", (t) => {
  const longitude = (metres) =>
    metres / (M * Math.cos((50.07 * Math.PI) / 180));
  const points = [START, [19.9, 50.08], [19.98, 50.08], END];
  const { suggest } = fixture(t, [
    place("via-leg", [19.9 + longitude(120), 50.07]),
    place("straight-chord-only", [19.94, 50.06]),
  ]);
  const results = suggest(line(points));
  assert.deepEqual(
    results.map((p) => p.id),
    ["via-leg"],
  );
  assert(Math.abs(results[0].distanceFromRouteMeters - 120) <= 1);
});

test("private, prohibited, explicitly inaccessible and representative centres are never recommended", (t) => {
  const inaccessible = { wheelchair: "no", toilet: "unknown" };
  const { suggest } = fixture(t, [
    place("private", undefined, { accessRestriction: "private" }),
    place("prohibited", undefined, { accessRestriction: "no" }),
    place("inaccessible", undefined, { access: inaccessible }),
    place("centre", undefined, { coordinateKind: "representative-center" }),
    place("park", undefined, { placeType: "park" }),
    place("toilet-no", undefined, {
      placeType: "toilet",
      access: { wheelchair: "unknown", toilet: "no" },
    }),
    place("unknown", undefined, { accessRestriction: null }),
    place("customer", undefined, {
      placeType: "toilet",
      accessRestriction: "customers",
      fee: "yes",
      openingHours: "Mo-Fr 10:00-16:00",
    }),
    place("permit", undefined, { accessRestriction: "permit" }),
  ]);
  const results = suggest(line([START, END]));
  assert.deepEqual(
    new Set(results.map((p) => p.id)),
    new Set(["unknown", "customer", "permit"]),
  );
  assert(
    results
      .find((p) => p.id === "unknown")
      .warnings.some((w) => w.includes("Brak danych o dostępności")),
  );
  const customer = results.find((p) => p.id === "customer");
  assert(customer.warnings.some((w) => w.includes("tylko dla klientów")));
  assert.deepEqual(customer.restrictions, [
    "Dostęp tylko dla klientów. Sprawdź warunki korzystania.",
  ]);
  assert(customer.details.some((d) => d.includes("jest płatne")));
  assert(
    customer.details.some((d) =>
      d.includes("Nie sprawdzono, czy miejsce jest teraz otwarte"),
    ),
  );
  assert(
    results
      .find((p) => p.id === "permit")
      .warnings.some((w) => w.includes("zezwolenia")),
  );
});

test("important access restrictions are structured for always-visible UI, including nonstandard access", (t) => {
  const { suggest } = fixture(t, [
    place("restricted", undefined, {
      accessRestriction: "residents",
      access: { wheelchair: "limited" },
    }),
    place("permit", undefined, { accessRestriction: "permit" }),
    place("unknown", undefined, { accessRestriction: null }),
  ]);
  const results = suggest(line([START, END]));
  assert.deepEqual(results.find((p) => p.id === "restricted").restrictions, [
    "Ograniczenie dostępu podane w źródle: residents.",
    "Mapa wskazuje ograniczoną dostępność na wózku.",
  ]);
  assert.deepEqual(results.find((p) => p.id === "permit").restrictions, [
    "Korzystanie wymaga zezwolenia. Sprawdź warunki dostępu.",
  ]);
  assert.deepEqual(results.find((p) => p.id === "unknown").restrictions, []);
});

test("community rest places expire at the boundary and remain distinct from confirmed accessibility", (t) => {
  const { suggest, addObservation } = fixture(t);
  addObservation("fresh");
  addObservation("expired", { until: NOW - 1 });
  addObservation("boundary", { until: NOW });
  addObservation("withdrawn", { status: "withdrawn" });
  addObservation("future", { observed: NOW + 1 });
  addObservation("different-kind", { type: "lift_working" });
  const results = suggest(line([START, END]));
  assert.deepEqual(
    results.map((p) => p.id),
    ["observation-fresh"],
  );
  assert.equal(results[0].kind, "rest_place");
  assert.equal(results[0].validUntil, new Date(NOW + 1000).toISOString());
  assert.equal(results[0].dataUpdatedAt, null);
  assert.deepEqual(results[0].restrictions, []);
  assert(
    results[0].warnings.some((w) =>
      w.includes("bez niezależnego potwierdzenia"),
    ),
  );
  assert(!JSON.stringify(results).includes("private-user-id"));
});

test("six deterministic suggestions preserve toilets and community records among many nearer benches", (t) => {
  const benches = Array.from({ length: 20 }, (_, n) =>
    place(`bench-${String(n).padStart(2, "0")}`, [19.92 + n * 0.001, 50.06]),
  );
  const { suggest, addObservation } = fixture(t, [
    ...benches,
    place("toilet", [19.94, 50.06 + 100 / M], {
      placeType: "toilet",
      category: "toilet",
    }),
  ]);
  addObservation("fresh", { coordinates: [19.94, 50.06 + 150 / M] });
  const first = suggest(line([START, END])),
    second = suggest(line([START, END]));
  assert.equal(first.length, 6);
  assert.deepEqual(first, second);
  assert(first.some((p) => p.kind === "toilet"));
  assert(first.some((p) => p.kind === "rest_place"));
  assert.equal(new Set(first.map((p) => p.id)).size, 6);
});

test("existing start, destination and via points are not suggested again; malformed geometry stays empty", (t) => {
  const { suggest } = fixture(t, [
    place("already-via"),
    place("elsewhere", [19.96, 50.06]),
  ]);
  assert.deepEqual(
    suggest(line([START, END]), [START, [19.94, 50.06], END]).map((p) => p.id),
    ["elsewhere"],
  );
  assert.deepEqual(suggest(line([START])), []);
  assert.deepEqual(suggest(line([START, [NaN, 50.06]])), []);
});

test("route API adds suggestions without another engine call and unnamed benches do not crowd general discovery or address search", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "przejscie-stops-"));
  const placesPath = join(directory, "places.json"),
    locationsPath = join(directory, "locations.json");
  const fixtures = [
    place("bench"),
    place("named", [19.938, 50.061], { name: "Ławka Wodeckiego" }),
    place("park", [19.94, 50.06], {
      name: "Park Testowy",
      placeType: "park",
      coordinateKind: "representative-center",
    }),
  ];
  writeFileSync(
    placesPath,
    JSON.stringify({ source: { label: "fixture" }, places: fixtures }),
  );
  writeFileSync(locationsPath, JSON.stringify({ source: {}, locations: [] }));
  let calls = 0;
  const app = createApp({
    dbPath: ":memory:",
    placesPath,
    locationsPath,
    fetchImpl: async () => {
      calls++;
      return new Response(
        JSON.stringify({
          features: [
            {
              geometry: line([START, END]).geometry,
              properties: {
                summary: { distance: 5000, duration: 4000 },
                way_points: [0, 1],
                segments: [],
              },
            },
          ],
          metadata: { engine: {} },
        }),
      );
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    app.locals.store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/api/route`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ start: START, end: END }),
  });
  assert.equal(response.status, 200);
  const route = await response.json();
  assert.equal(calls, 1);
  assert(route.stopSuggestions.some((p) => p.id === "bench"));
  assert.equal(route.distanceM, 5000);
  assert(route.warnings.length > 0);
  const all = await (await fetch(`${base}/api/places`)).json();
  assert(!all.places.some((p) => p.id === "bench"));
  assert(all.places.some((p) => p.id === "named"));
  const outdoors = await (
    await fetch(`${base}/api/places?category=outdoors`)
  ).json();
  assert.equal(outdoors.places.at(-1).id, "bench");
  const explicit = await (
    await fetch(`${base}/api/places?q=${encodeURIComponent("ławka")}`)
  ).json();
  assert(explicit.places.some((p) => p.id === "bench"));
  const locations = await (
    await fetch(`${base}/api/locations?q=${encodeURIComponent("ławka")}`)
  ).json();
  assert.deepEqual(
    locations.locations.map((p) => p.id),
    ["named"],
  );
});

test("local imported snapshot preserves bench and toilet evidence without fabricated public access", () => {
  const data = JSON.parse(
    readFileSync(
      new URL("../../server/data/places.json", import.meta.url),
      "utf8",
    ),
  );
  const benches = data.places.filter((p) => p.placeType === "bench");
  assert(benches.length > 1000);
  assert(benches.every((p) => p.coordinateKind === "osm-node"));
  assert(benches.some((p) => p.bench.backrest === "yes"));
  const customerToilet = data.places.find(
    (p) => p.id === "osm-node-3537839648",
  );
  assert.equal(customerToilet.name, "Toaleta");
  assert.equal(customerToilet.accessRestriction, "customers");
  assert.equal(customerToilet.fee, "no");
  assert.equal(customerToilet.verifiedAt, null);
  assert(data.places.some((p) => p.category === "toilet" && p.openingHours));
});
