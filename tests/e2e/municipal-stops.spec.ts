import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { Place } from "../../web/src/types";

async function discover(page: Page, name: string) {
  await page.goto("/app");
  await page.getByRole("button", { name: "Na razie pomiń" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Odkrywaj", exact: true })
    .click();
  await page.getByLabel("Szukaj miejsca w Krakowie").fill(name);
}

test("real municipal stop explains equipment and provenance and can be used as a route destination", async ({
  page,
  request,
}) => {
  const response = await request.get(
    "http://127.0.0.1:3082/api/places?q=Teatr%20S%C5%82owackiego%2003&category=transport",
  );
  const data = await response.json();
  const place: Place = data.places.find((p: Place) => p.municipalFacts);
  expect(place).toBeTruthy();
  expect(place.access.wheelchair).toBe("unknown");
  expect(place.verifiedAt).toBeNull();
  expect(place.municipalFacts?.benchesOutsideShelter).toBe(4);
  expect(JSON.stringify(place)).not.toContain('"Editor"');
  await discover(page, "Teatr Słowackiego 03");
  await page.locator(".place-card").filter({ hasText: "Dane miasta" }).click();
  const facts = page.getByRole("region", {
    name: "Zasady korzystania",
    exact: true,
  });
  await expect(facts).toContainText("Nawierzchnia peronu");
  await expect(facts).toContainText("Kostka");
  await expect(facts).toContainText("Kassel");
  await expect(facts).toContainText("nie potwierdzają dostępnego dojścia");
  const evidence = page.getByRole("region", {
    name: "Źródło i aktualność",
    exact: true,
  });
  await expect(evidence).toContainText(
    "Zarząd Transportu Publicznego w Krakowie",
  );
  await expect(evidence).toContainText("Pobrano do aplikacji");
  await expect(evidence).toContainText("Nie potwierdziliśmy ich w terenie");
  await evidence.getByText("O zbiorze danych", { exact: true }).click();
  await expect(evidence).toContainText("Gmina Miejska Kraków");
  await expect(
    evidence.getByRole("link", { name: "Portal Otwarte Dane" }),
  ).toHaveAttribute("href", "https://otwartedane.um.krakow.pl");
  expect(
    (
      await new AxeBuilder({ page })
        .include(".place-detail")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({ path: "artifacts/municipal-stop-desktop.png" });
  await page
    .getByRole("button", { name: "Zaplanuj przejście", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Dokąd", exact: true }),
  ).toHaveValue(place.name);
  await page
    .getByRole("button", { name: "Zapisz miejsce: Dokąd", exact: true })
    .click();
  await page.getByLabel("Nazwa miejsca", { exact: true }).fill("Przystanek");
  await page
    .getByRole("button", { name: "Zapisz miejsce", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Miejsce, do którego wracasz" }),
  ).toBeHidden();
  const favorite = await page.evaluate(
    () => JSON.parse(localStorage.getItem("przejscie-guest-favorites")!)[0],
  );
  expect(favorite.point.sourceUrl).toBe(place.sourceUrl);
  expect(favorite.point.sourceLabel).toBe(place.sourceLabel);
  expect(favorite.point.coordinateKind).toBe("source-point");
  await page.reload();
  await page.getByRole("combobox", { name: "Dokąd", exact: true }).click();
  await page
    .getByRole("option", { name: /^Przystanek Teatr Słowackiego 03/ })
    .click();
  await page
    .getByRole("combobox", { name: "Skąd", exact: true })
    .fill("Długa 12");
  await page
    .getByRole("listbox", { name: "Podpowiedzi: Skąd" })
    .getByRole("option")
    .first()
    .click();
  const routeRequest = page.waitForRequest(
    (r) => r.url().endsWith("/api/route") && r.method() === "POST",
  );
  await page
    .getByRole("button", { name: "Wyznacz trasę", exact: true })
    .click();
  expect((await routeRequest).postDataJSON().end).toEqual(place.coordinates);
  await expect(
    page.getByRole("heading", { name: "Przebieg trasy" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Zapisz plan", exact: true }).click();
  const savedPlan = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("przejscie-saved-route")!),
  );
  expect(savedPlan.place.sourceUrl).toBe(place.sourceUrl);
  expect(savedPlan.place.sourceLabel).toBe(place.sourceLabel);
  expect(savedPlan.place.coordinateKind).toBe("source-point");
});

test("municipal source outage keeps original dates, missing values and explicit zero distinct on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/\/api\/places(?:\?|$)/, (route) =>
    route.fulfill({
      json: {
        total: 1,
        municipalData: {
          status: "error",
          available: true,
          lastSuccessAt: "2026-10-01T09:00:00Z",
        },
        places: [
          {
            id: "ztp-stop-fixture",
            name: "Przystanek testowy",
            category: "transport",
            coordinates: [19.94, 50.061],
            description: "Fixture interfejsu",
            address: "",
            access: {
              wheelchair: "unknown",
              widthCm: null,
              surface: null,
              toilet: "unknown",
              entranceNotes: "",
            },
            sourceUrl: "https://otwartedane.um.krakow.pl",
            sourceLabel: "Zarząd Transportu Publicznego w Krakowie",
            verifiedAt: null,
            municipalFacts: {
              stopCode: "TEST-01",
              stopType: "Autobusowy",
              platformSurface: null,
              kerbType: null,
              benchesOutsideShelter: 0,
              shelters: null,
              validFrom: null,
              validUntil: null,
            },
            provenance: {
              datasetId: "ztp-kmk-stops",
              publisher: "Zarząd Transportu Publicznego w Krakowie",
              datasetUrl: "https://otwartedane.um.krakow.pl",
              recordUrl: "https://otwartedane.um.krakow.pl",
              recordUpdatedAt: "2024-04-02T10:00:00Z",
              fetchedAt: "2026-10-01T09:00:00Z",
              sourceUpdatedAt: "2026-09-30T10:00:00Z",
              termsUrl: "https://otwartedane.um.krakow.pl",
              verification: "source-only",
            },
          },
        ],
      },
    }),
  );
  await discover(page, "Przystanek testowy");
  await page.locator(".place-card").click();
  const facts = page.getByRole("region", {
    name: "Zasady korzystania",
    exact: true,
  });
  await expect(
    facts
      .locator("dl > div")
      .filter({ hasText: "Ławki poza wiatą" })
      .locator("dd"),
  ).toHaveText("0");
  await expect(
    facts
      .locator("dl > div")
      .filter({ hasText: /^Wiaty/ })
      .locator("dd"),
  ).toHaveText("Brak danych");
  const evidence = page.getByRole("region", {
    name: "Źródło i aktualność",
    exact: true,
  });
  await expect(evidence.getByRole("status")).toHaveText(
    "Nie udało się odświeżyć danych miasta. Pokazujemy ostatni pobrany zapis.",
  );
  await expect(evidence).toContainText("2 kwietnia 2024");
  await expect(evidence).toContainText("1 października 2026");
  await expect(evidence).not.toContainText("Sprawdzenie w terenie zapisano");
  await evidence.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(evidence.locator("details")).toHaveAttribute("open", "");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await evidence.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "artifacts/municipal-source-outage-mobile.png",
  });
});

test("first municipal import failure is visible without any city record and retry reads recovery", async ({
  page,
}) => {
  let failed = true;
  await page.route(/\/api\/places(?:\?|$)/, (route) =>
    route.fulfill({
      json: {
        places: [],
        total: 0,
        municipalData: {
          status: failed ? "error" : "success",
          available: !failed,
        },
      },
    }),
  );
  await discover(page, "Brak wyniku");
  const banner = page.locator(".municipal-data-banner");
  await expect(banner).toContainText(
    "Dane przystanków z miasta są niedostępne",
  );
  await expect(banner).toContainText("lista miejsc może być niepełna");
  await expect(
    page.getByRole("heading", { name: "Nie znaleźliśmy takiego miejsca." }),
  ).toBeVisible();
  failed = false;
  await banner.getByRole("button", { name: "Sprawdź ponownie" }).click();
  await expect(banner).toHaveCount(0);
  await expect(page.getByLabel("Szukaj miejsca w Krakowie")).toHaveValue(
    "Brak wyniku",
  );
});
