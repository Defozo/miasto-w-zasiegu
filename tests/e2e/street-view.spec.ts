import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { streetViewPoint, streetViewUrls } from "../../web/src/street-view";
import type { Route } from "../../web/src/types";

const fixture: Route = {
  geometry: {
    type: "LineString",
    coordinates: [
      [19.937, 50.065],
      [19.937, 50.066],
      [19.937, 50.066],
      [19.939, 50.066],
    ],
  },
  distanceM: 250,
  durationS: 240,
  steps: [
    {
      instruction: "Dane testowe: jedź prosto",
      distanceM: 110,
      wayPoints: [0, 1],
    },
    {
      instruction: "Dane testowe: skręć w prawo",
      distanceM: 140,
      wayPoints: [1, 3],
    },
    {
      instruction: "Dane testowe: dotarłeś do celu",
      distanceM: 0,
      wayPoints: [3, 3],
    },
  ],
  warnings: ["Trasa testowa interfejsu, bez audytu terenowego."],
  source: { engine: "isolated UI fixture" },
};

test("camera uses the turn start, outgoing bearing, duplicate vertices and arrival direction", () => {
  expect(streetViewPoint(fixture, fixture.steps[0])?.heading).toBeCloseTo(0, 1);
  const turn = streetViewPoint(fixture, fixture.steps[1])!;
  expect(turn.coordinates).toEqual([19.937, 50.066]);
  expect(turn.heading).toBeCloseTo(90, 1);
  expect(streetViewPoint(fixture, fixture.steps[2])?.heading).toBeCloseTo(
    90,
    1,
  );
  const urls = streetViewUrls(turn, "test-key");
  expect(new URL(urls.embed!).searchParams.get("location")).toBe(
    "50.066,19.937",
  );
  expect(new URL(urls.external).searchParams.get("viewpoint")).toBe(
    "50.066,19.937",
  );
  expect(new URL(urls.external).searchParams.has("key")).toBe(false);
});

test("missing coordinates never silently open a different route point", () => {
  for (const wayPoints of [
    [-1, 2],
    [1.5, 2],
    [0, 99],
    [2, 1],
  ] as [number, number][]) {
    expect(
      streetViewPoint(fixture, { ...fixture.steps[0], wayPoints }),
    ).toBeNull();
  }
  expect(
    streetViewPoint(
      {
        ...fixture,
        geometry: {
          type: "LineString",
          coordinates: [
            [NaN, 50],
            [19, 50],
          ],
        },
      },
      fixture.steps[0],
    ),
  ).toBeNull();
  expect(streetViewUrls({ coordinates: [19.937, 50.066] }).embed).toBeNull();
});

async function address(page: Page, label: string, query: string) {
  const input = page.getByRole("combobox", { name: label, exact: true });
  await input.fill(query);
  await page
    .getByRole("listbox", { name: `Podpowiedzi: ${label}` })
    .getByRole("option")
    .first()
    .click();
}

async function plan(page: Page) {
  await page.route("https://tiles.openfreemap.org/styles/positron", (route) =>
    route.fulfill({
      json: {
        version: 8,
        sources: {},
        layers: [
          {
            id: "test-background",
            type: "background",
            paint: { "background-color": "#edf2ed" },
          },
        ],
      },
    }),
  );
  await page.route("**/api/route", (route) => route.fulfill({ json: fixture }));
  // The iframe fixture exercises integration without sending test routes to Google.
  await page.route("https://www.google.com/maps/embed/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html lang="pl"><head><title>Testowy podgląd</title></head><body><main>Testowa panorama</main></body></html>',
    }),
  );
  await page.goto("/app");
  await page
    .getByRole("button", { name: "Pomiń na razie", exact: true })
    .click();
  await page.getByRole("button", { name: /^Klub Pod Jaszczurami/ }).click();
  await page.getByRole("button", { name: "Nawiguj", exact: true }).click();
  const list = page.getByRole("button", { name: "Pokaż listę", exact: true });
  if (await list.isVisible()) await list.click();
  await address(page, "Skąd", "Długa 12");
  await address(page, "Dokąd", "Rynek Główny 1");
  await page
    .getByRole("button", { name: "Wyznacz trasę", exact: true })
    .click();
  await expect(page.locator(".route-steps > li")).toHaveCount(3);
}

for (const width of [1440, 390])
  test(`Street View loads on demand, follows steps and closes with the keyboard at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    let configs = 0;
    await page.route("**/api/integrations/maps", (route) => {
      configs++;
      return route.fulfill({
        json: { googlePlacesUi: { enabled: true, browserKey: "test-key" } },
      });
    });
    await plan(page);
    const placeCardRequests = configs;
    await expect(page.locator(".street-view-preview iframe")).toHaveCount(0);
    const first = page.getByRole("button", {
      name: "Pokaż Street View dla kroku 1",
      exact: true,
    });
    await first.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".street-view-preview iframe")).toHaveCount(1);
    expect(configs).toBe(placeCardRequests + 1);
    await page
      .getByRole("button", {
        name: "Pokaż Street View dla kroku 2",
        exact: true,
      })
      .click();
    const frame = page.locator(".street-view-preview iframe");
    await expect(frame).toHaveCount(1);
    const src = new URL((await frame.getAttribute("src"))!);
    expect(src.searchParams.get("location")).toBe("50.066,19.937");
    expect(src.searchParams.get("heading")).toBe("90.0");
    expect(configs).toBe(placeCardRequests + 1);
    await expect(frame).toHaveAttribute("title", /krok 2:.*skręć w prawo/);
    await expect(frame).toHaveAttribute(
      "referrerpolicy",
      "strict-origin-when-cross-origin",
    );
    await expect(page.locator(".street-view-preview:visible")).toContainText(
      "nie potwierdza aktualnej przejezdności",
    );
    const audit = await new AxeBuilder({ page })
      .include(".route-steps")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(audit.violations).toEqual([]);
    const box = await frame.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(200);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await page
      .locator(".street-view-preview:visible")
      .screenshot({ path: testInfo.outputPath(`street-view-${width}.png`) });
    const close = page.getByRole("button", {
      name: "Ukryj Street View dla kroku 2",
      exact: true,
    });
    await close.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".street-view-preview iframe")).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Pokaż Street View dla kroku 2",
        exact: true,
      }),
    ).toBeFocused();
  });

test("configuration failure can be retried and offline mode keeps the route text", async ({
  page,
}) => {
  let available = false;
  await page.route("**/api/integrations/maps", (route) =>
    available
      ? route.fulfill({
          json: { googlePlacesUi: { enabled: true, browserKey: "test-key" } },
        })
      : route.fulfill({
          status: 503,
          json: { error: { message: "Testowa awaria" } },
        }),
  );
  await plan(page);
  await page
    .getByRole("button", { name: "Pokaż Street View dla kroku 2", exact: true })
    .click();
  await expect(page.locator(".street-view-preview:visible")).toContainText(
    "Podgląd w aplikacji jest chwilowo niedostępny",
  );
  await expect(
    page.getByRole("link", { name: /Otwórz Street View w Google Maps/ }),
  ).toHaveAttribute("href", /viewpoint=50.066%2C19.937/);
  await expect(page.locator(".street-view-preview iframe")).toHaveCount(0);
  available = true;
  await page
    .getByRole("button", { name: "Spróbuj ponownie", exact: true })
    .click();
  await expect(page.locator(".street-view-preview iframe")).toHaveCount(1);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(page.locator(".street-view-preview iframe")).toHaveCount(0);
  await expect(page.locator(".street-view-preview:visible")).toContainText(
    "Street View wymaga internetu",
  );
  await expect(page.locator(".route-steps")).toContainText(
    "Dane testowe: skręć w prawo",
  );
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.locator(".street-view-preview iframe")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Przelicz trasę", exact: true })
    .click();
  await expect(page.locator(".route-steps > li")).toHaveCount(3);
  await expect(page.locator(".street-view-preview iframe")).toHaveCount(0);
});
