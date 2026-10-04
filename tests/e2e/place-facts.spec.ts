import { test, expect, type Page } from "@playwright/test";
import type { Place } from "../../web/src/types";

const fixture: Place = {
  id: "place-facts-fixture",
  name: "Miejsce z warunkami korzystania",
  category: "toilet",
  coordinates: [19.938, 50.061],
  description: "Przykładowe dane do testu interfejsu.",
  address: "Adres testowy",
  access: {
    wheelchair: "unknown",
    widthCm: null,
    surface: null,
    toilet: "unknown",
    entranceNotes: "",
  },
  sourceUrl: "https://www.openstreetmap.org/node/3537839648",
  verifiedAt: null,
  sourceLabel: "Fixture interfejsu",
  coordinateKind: "osm-node",
};

async function openFixture(page: Page, extra: Partial<Place>) {
  await page.route(/\/api\/places(?:\?|$)/, (route) =>
    route.fulfill({
      json: {
        places: [{ ...fixture, ...extra }],
        total: 1,
        source: { label: "Fixture interfejsu" },
      },
    }),
  );
  await page.goto("/app");
  await page.getByRole("button", { name: "Na razie pomiń" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Odkrywaj", exact: true })
    .click();
  await page.locator(".place-card").filter({ hasText: fixture.name }).click();
  return page.getByRole("region", { name: "Zasady korzystania", exact: true });
}

test("place details show customer restrictions, source hours and fees without claiming current opening", async ({
  page,
}) => {
  const facts = await openFixture(page, {
    accessRestriction: "customers",
    openingHours: "Mo-Fr 09:00-18:00; Sa 10:00-14:00; Su off",
    fee: "yes",
    osmUpdatedAt: "2021-05-04T10:00:00Z",
  });
  await expect(facts).toBeVisible();
  await expect(facts.locator(".place-facts-restricted")).toContainText(
    "Tylko dla klientów",
  );
  await expect(facts).toContainText(
    "pon.-pt. 09:00-18:00; sob. 10:00-14:00; niedz. nieczynne",
  );
  await expect(facts).toContainText("Według źródła: płatne.");
  await expect(facts).toContainText(
    "Te godziny nie potwierdzają, że miejsce jest teraz otwarte.",
  );
  await expect(facts.locator(".place-facts-position")).toHaveCount(0);
  const evidence = page.getByRole("region", { name: "Źródło i aktualność", exact: true });
  await expect(evidence).toContainText("4 maja 2021");
  await expect(evidence).toContainText("Nie potwierdziliśmy ich w terenie");
  await expect(evidence).not.toContainText("Pobrano do aplikacji");
});

test("private parks retain their access restriction even if free, and map centres are not presented as entrances", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const facts = await openFixture(page, {
    category: "outdoors",
    placeType: "park",
    accessRestriction: "private",
    openingHours: null,
    fee: "no",
    coordinateKind: "representative-center",
  });
  await expect(facts.locator(".place-facts-restricted")).toContainText(
    "Miejsce prywatne",
  );
  await expect(facts).toContainText("Nie zakładaj możliwości wejścia.");
  await expect(facts).toContainText("Brak danych o godzinach.");
  await expect(facts).toContainText("Według źródła: bezpłatne.");
  await expect(facts.locator(".place-facts-position")).toContainText(
    "Nie wskazuje sprawdzonego wejścia.",
  );
  await expect(facts).not.toContainText("dostęp publiczny");
  const width = await facts.evaluate((element) => ({
    scroll: element.scrollWidth,
    client: element.clientWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
});
