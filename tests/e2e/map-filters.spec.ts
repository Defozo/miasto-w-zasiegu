import { test, expect, type Page } from "@playwright/test";
import type {
  BarrierReport,
  CommunityObservation,
  Place,
} from "../../web/src/types";

const accessibleToilet: Place = {
  id: "filter-toilet-accessible",
  name: "Toaleta z informacją o dostępności",
  category: "toilet",
  coordinates: [19.938, 50.061],
  description: "Dane testowe interfejsu, bez zapisu obserwacji w bazie.",
  address: "Adres testowy",
  access: {
    wheelchair: "yes",
    widthCm: null,
    surface: null,
    toilet: "yes",
    entranceNotes: "",
  },
  sourceUrl: "https://www.openstreetmap.org/",
  sourceLabel: "Fixture interfejsu, bez audytu terenowego",
  verifiedAt: null,
  placeType: "toilet",
  fee: "no",
  accessRestriction: "yes",
  openingHours: "24/7",
};
const unknownToilet: Place = {
  ...accessibleToilet,
  id: "filter-toilet-unknown",
  name: "Toaleta bez danych o dostępności",
  coordinates: [19.944, 50.058],
  access: {
    ...accessibleToilet.access,
    wheelchair: "unknown",
    toilet: "unknown",
  },
  fee: null,
  accessRestriction: null,
  openingHours: null,
};
const culturePlace: Place = {
  ...accessibleToilet,
  id: "filter-culture",
  name: "Muzeum testowe",
  coordinates: [19.935, 50.054],
  category: "culture",
  placeType: null,
  access: { ...accessibleToilet.access, toilet: "unknown" },
};

async function start(page: Page) {
  await page.goto("/app");
  await page
    .getByRole("button", { name: "Na razie pomiń", exact: true })
    .click();
}

async function openFilters(page: Page) {
  await page.getByRole("button", { name: "Filtry mapy", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Filtry mapy", exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function fixtureMap(page: Page) {
  // A local style makes marker assertions independent of the external tile host.
  await page.route("https://tiles.openfreemap.org/styles/positron", (route) =>
    route.fulfill({
      json: {
        version: 8,
        sources: {},
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#eef1eb" },
          },
        ],
      },
    }),
  );
}

test("the accessible toilet preset requests known accessibility and shows its result on the journey map", async ({
  page,
}) => {
  await fixtureMap(page);
  await page.route(/\/api\/places(?:\?|$)/, (route) => {
    const params = new URL(route.request().url()).searchParams;
    const places =
      params.get("category") === "toilet" &&
      params.get("accessibleToilet") === "true"
        ? [accessibleToilet]
        : [accessibleToilet, unknownToilet, culturePlace];
    return route.fulfill({
      json: {
        places,
        total: places.length,
        source: { label: "Fixture interfejsu" },
      },
    });
  });
  await start(page);
  await expect(page.locator(".map-section")).toHaveAttribute(
    "data-map-ready",
    "true",
  );
  await expect.poll(() => page.locator(".place-pin").evaluateAll(pins =>
    pins.reduce((sum, pin) => sum + Number((pin as HTMLElement).dataset.placeCount), 0),
  )).toBe(3);

  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Odkrywaj", exact: true })
    .click();
  await page
    .locator(".place-card")
    .filter({ hasText: culturePlace.name })
    .click();
  await page
    .getByRole("button", { name: "Zaplanuj przejście", exact: true })
    .click();
  await expect(
    page.getByRole("img", {
      name: `Cel trasy: ${culturePlace.name}`,
      exact: true,
    }),
  ).toBeVisible();

  let dialog = await openFilters(page);
  await dialog
    .getByRole("checkbox", { name: "Miejsca na mapie", exact: true })
    .uncheck();
  await dialog
    .getByRole("button", { name: "Pokaż wyniki", exact: true })
    .click();
  await expect(page.locator(".place-pin")).toHaveCount(0);

  dialog = await openFilters(page);
  const filteredRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/places" &&
      url.searchParams.get("category") === "toilet" &&
      url.searchParams.get("accessibleToilet") === "true"
    );
  });
  await dialog
    .getByRole("button", { name: "Dostępne toalety", exact: true })
    .click();
  await filteredRequest;
  await expect(
    dialog.getByRole("checkbox", { name: "Miejsca na mapie", exact: true }),
  ).toBeChecked();
  await expect(
    dialog.getByRole("combobox", { name: "Rodzaj miejsca", exact: true }),
  ).toHaveValue("toilet");
  await expect(
    dialog.getByRole("checkbox", {
      name: "Toaleta dostępna dla wózka",
      exact: true,
    }),
  ).toBeChecked();
  await dialog
    .getByRole("button", { name: "Pokaż wyniki", exact: true })
    .click();

  await expect(
    page.getByRole("heading", { name: "Dokąd ruszamy?", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: `Pokaż miejsce: ${accessibleToilet.name}`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".place-pin")).toHaveCount(1);
  await expect(
    page.getByRole("button", {
      name: `Pokaż miejsce: ${unknownToilet.name}`,
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Odkrywaj", exact: true })
    .click();
  await expect(page.locator(".place-card")).toHaveCount(1);
  await expect(page.locator(".place-card")).toContainText(
    accessibleToilet.name,
  );
  for (const tab of ["Wspólnie", "Twój profil", "Konto"]) {
    await page
      .getByRole("navigation")
      .getByRole("button", { name: tab, exact: true })
      .click();
    await expect(page.locator(".place-pin")).toHaveCount(1);
    await expect(
      page.getByRole("button", {
        name: `Pokaż miejsce: ${culturePlace.name}`,
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: `Pokaż miejsce: ${accessibleToilet.name}`,
        exact: true,
      }),
    ).toBeVisible();
  }
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Twoja trasa", exact: true })
    .click();
  await expect(
    page.getByRole("img", {
      name: `Cel trasy: ${culturePlace.name}`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Dokąd", exact: true }),
  ).toHaveValue(culturePlace.name);
});

test("place criteria reach the API and clearing filters restores the full search", async ({
  page,
}) => {
  await fixtureMap(page);
  const queries: URLSearchParams[] = [];
  await page.route(/\/api\/places(?:\?|$)/, (route) => {
    queries.push(new URL(route.request().url()).searchParams);
    return route.fulfill({
      json: { places: [], total: 0, source: { label: "Fixture interfejsu" } },
    });
  });
  await start(page);
  const dialog = await openFilters(page);
  await dialog
    .getByRole("combobox", { name: "Rodzaj miejsca", exact: true })
    .selectOption("toilet");
  await dialog
    .getByRole("combobox", { name: "Dostępność dla wózka", exact: true })
    .selectOption("yes");
  await dialog
    .getByRole("checkbox", { name: "Toaleta dostępna dla wózka", exact: true })
    .check();
  await dialog
    .getByRole("checkbox", { name: "Bezpłatne", exact: true })
    .check();
  await dialog
    .getByRole("checkbox", { name: "Dostęp ogólny", exact: true })
    .check();
  await dialog
    .getByRole("checkbox", { name: "Całodobowe", exact: true })
    .check();
  await expect
    .poll(() => {
      const params = queries.at(-1)!;
      return [
        "category",
        "wheelchair",
        "accessibleToilet",
        "freeOnly",
        "publicOnly",
        "open247",
      ].map((key) => params.get(key));
    })
    .toEqual(["toilet", "yes", "true", "true", "true", "true"]);

  await dialog
    .getByRole("button", { name: "Wyczyść filtry", exact: true })
    .click();
  await dialog
    .getByRole("combobox", { name: "Rodzaj miejsca", exact: true })
    .selectOption("outdoors");
  await dialog
    .locator("summary")
    .filter({ hasText: "Ławki i odpoczynek" })
    .click();
  await dialog
    .getByRole("checkbox", { name: "Tylko ławki", exact: true })
    .check();
  await dialog
    .getByRole("checkbox", { name: "Z oparciem", exact: true })
    .check();
  await dialog
    .getByRole("checkbox", { name: "Z podłokietnikami", exact: true })
    .check();
  await expect
    .poll(() => {
      const params = queries.at(-1)!;
      return ["category", "placeType", "backrest", "armrest"].map((key) =>
        params.get(key),
      );
    })
    .toEqual(["outdoors", "bench", "true", "true"]);

  await dialog
    .getByRole("button", { name: "Wyczyść filtry", exact: true })
    .click();
  await expect(
    dialog.getByRole("combobox", { name: "Rodzaj miejsca", exact: true }),
  ).toHaveValue("all");
  await expect(
    dialog.getByRole("combobox", { name: "Dostępność dla wózka", exact: true }),
  ).toHaveValue("all");
  await expect
    .poll(() => {
      const params = queries.at(-1)!;
      return [
        "category",
        "wheelchair",
        "accessibleToilet",
        "freeOnly",
        "publicOnly",
        "open247",
        "placeType",
        "backrest",
        "armrest",
      ].filter((key) => params.has(key));
    })
    .toEqual([]);
});

test("place, barrier and each current community layer can be hidden independently and reset", async ({
  page,
}) => {
  await fixtureMap(page);
  const now = Date.now();
  const observations: CommunityObservation[] = [
    {
      type: "rest_place",
      label: "Odpoczynek testowy",
      coordinates: [19.9392, 50.063],
    },
    {
      type: "step_free_entrance",
      label: "Wejście testowe",
      coordinates: [19.936, 50.057],
    },
    {
      type: "lift_working",
      label: "Winda testowa",
      coordinates: [19.944, 50.054],
    },
  ].map((entry, index) => ({
    ...entry,
    type: entry.type as CommunityObservation["type"],
    coordinates: entry.coordinates as CommunityObservation["coordinates"],
    id: `filter-observation-${index}`,
    description: "Przykładowa obserwacja tylko do testu interfejsu.",
    observedAt: new Date(now).toISOString(),
    validUntil: new Date(now + 86400000).toISOString(),
    status: "active",
    isMine: false,
    stale: false,
  }));
  const report: BarrierReport = {
    id: "filter-barrier",
    kind: "obstacle",
    coordinates: [19.94, 50.056],
    description: "Bariera testowa, bez zapisu w bazie.",
    widthCm: null,
    status: "active",
    createdAt: new Date(now).toISOString(),
    resolvedAt: null,
    ageHours: 0,
    stale: false,
    sourceLabel: "Fixture interfejsu",
  };
  await page.route(/\/api\/places(?:\?|$)/, (route) =>
    route.fulfill({
      json: {
        places: [accessibleToilet],
        total: 1,
        source: { label: "Fixture interfejsu" },
      },
    }),
  );
  await page.route("**/api/reports", (route) =>
    route.fulfill({ json: { reports: [report] } }),
  );
  await page.route("**/api/observations", (route) =>
    route.fulfill({ json: { observations } }),
  );
  await start(page);
  await expect(page.locator(".place-pin")).toHaveCount(1);
  await expect(page.locator(".report-pin")).toHaveCount(1);
  await expect(page.locator(".observation-pin")).toHaveCount(3);

  const dialog = await openFilters(page);
  await dialog
    .getByRole("checkbox", { name: "Bariery i utrudnienia", exact: true })
    .uncheck();
  await expect(page.locator(".report-pin")).toHaveCount(0);
  await expect(page.locator(".observation-pin")).toHaveCount(3);
  await expect(page.locator(".place-pin")).toHaveCount(1);
  for (const [index, label] of [
    "Miejsca odpoczynku",
    "Wejścia bez schodów",
    "Działające windy",
  ].entries()) {
    await dialog.getByRole("checkbox", { name: label, exact: true }).uncheck();
    await expect(page.locator(".observation-pin")).toHaveCount(2 - index);
    await expect(page.locator(".place-pin")).toHaveCount(1);
  }
  await dialog
    .getByRole("checkbox", { name: "Miejsca na mapie", exact: true })
    .uncheck();
  await expect(page.locator(".place-pin")).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Pokaż wyniki", exact: true })
    .click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Wspólnie", exact: true })
    .click();
  await page
    .locator('[data-observation-id="filter-observation-0"]')
    .getByRole("button", { name: "Na mapie", exact: true })
    .click();
  await expect(page.locator(".observation-pin")).toHaveCount(1);
  await expect(
    page.getByRole("button", {
      name: "Odkrycie: Odpoczynek testowy. Pokaż opis",
      exact: true,
    }),
  ).toBeInViewport();
  await expect(page.locator(".report-pin")).toHaveCount(0);
  await expect(page.locator(".place-pin")).toHaveCount(0);
  await openFilters(page);
  await expect(
    dialog.getByRole("checkbox", { name: "Miejsca odpoczynku", exact: true }),
  ).toBeChecked();
  await expect(
    dialog.getByRole("checkbox", { name: "Wejścia bez schodów", exact: true }),
  ).not.toBeChecked();
  await expect(
    dialog.getByRole("checkbox", { name: "Działające windy", exact: true }),
  ).not.toBeChecked();
  await dialog
    .getByRole("button", { name: "Wyczyść filtry", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Pokaż wyniki", exact: true })
    .click();
  await expect(page.locator(".place-pin")).toHaveCount(1);
  await expect(page.locator(".report-pin")).toHaveCount(1);
  await expect(page.locator(".observation-pin")).toHaveCount(3);
});

test("mobile filters fit the screen, keep keyboard focus, and open from every navigation tab and map", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixtureMap(page);
  await start(page);
  const opener = page.getByRole("button", { name: "Filtry mapy", exact: true });
  const dialog = await openFilters(page);
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(391);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(845);
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 320, height: 640 });
  const narrowBounds = await dialog.boundingBox();
  expect(narrowBounds).not.toBeNull();
  expect(narrowBounds!.x).toBeGreaterThanOrEqual(0);
  expect(narrowBounds!.x + narrowBounds!.width).toBeLessThanOrEqual(321);
  expect(narrowBounds!.y).toBeGreaterThanOrEqual(0);
  expect(narrowBounds!.y + narrowBounds!.height).toBeLessThanOrEqual(641);
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(
    () => (document.documentElement.dataset.textSize = "large"),
  );
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
  expect(
    await dialog
      .locator(".map-filters-footer")
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
  ).toBe(true);
  await page.evaluate(() => delete document.documentElement.dataset.textSize);
  for (let index = 0; index < 28; index++) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await dialog
    .getByRole("button", { name: "Dostępne toalety", exact: true })
    .focus();
  await page.screenshot({ path: "artifacts/map-filters-mobile.png" });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();

  for (const tab of [
    "Odkrywaj",
    "Wspólnie",
    "Twój profil",
    "Konto",
    "Twoja trasa",
  ]) {
    await page
      .getByRole("navigation")
      .getByRole("button", { name: tab, exact: true })
      .click();
    await openFilters(page);
    await dialog
      .getByRole("button", { name: "Pokaż wyniki", exact: true })
      .click();
    await expect(dialog).toBeHidden();
  }
  await page.locator(".mobile-map-toggle").click();
  await openFilters(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("real place data excludes unknown accessibility, filters before limiting, and renders the toilet preset", async ({
  page,
  request,
}) => {
  const [allResponse, accessibleResponse, limitedResponse, unknownResponse] =
    await Promise.all([
      request.get("/api/places?category=toilet&limit=100"),
      request.get(
        "/api/places?category=toilet&accessibleToilet=true&limit=100",
      ),
      request.get("/api/places?category=toilet&accessibleToilet=true&limit=1"),
      request.get("/api/places?category=toilet&wheelchair=unknown&limit=100"),
    ]);
  for (const response of [
    allResponse,
    accessibleResponse,
    limitedResponse,
    unknownResponse,
  ])
    expect(response.ok()).toBe(true);
  const all = await allResponse.json();
  const accessible = await accessibleResponse.json();
  const limited = await limitedResponse.json();
  const unknown = await unknownResponse.json();
  expect(accessible.total).toBeGreaterThan(1);
  expect(accessible.total).toBeLessThan(all.total);
  expect(
    accessible.places.every(
      (place: Place) =>
        place.category === "toilet" && place.access.toilet === "yes",
    ),
  ).toBe(true);
  expect(unknown.total).toBeGreaterThan(0);
  expect(
    unknown.places.every(
      (place: Place) => place.access.wheelchair === "unknown",
    ),
  ).toBe(true);
  expect(limited.total).toBe(accessible.total);
  expect(limited.places).toHaveLength(1);
  expect(limited.places[0].id).toBe(accessible.places[0].id);

  await start(page);
  const dialog = await openFilters(page);
  await dialog
    .getByRole("button", { name: "Dostępne toalety", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Pokaż wyniki", exact: true })
    .click();
  await expect(page.locator(".map-section")).toHaveAttribute(
    "data-map-ready",
    "true",
  );
  await expect(page.locator(".place-pin").first()).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Odkrywaj", exact: true })
    .click();
  await expect(page.locator(".place-card").first()).toBeVisible();
  await page.screenshot({ path: "artifacts/map-filters-toilets-desktop.png" });
});
