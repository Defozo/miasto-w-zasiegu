import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { StopSuggestion } from "../../web/src/types";

async function address(page: Page, label: string, query: string) {
  await page.getByRole("combobox", { name: label, exact: true }).fill(query);
  await page
    .getByRole("listbox", { name: `Podpowiedzi: ${label}` })
    .getByRole("option")
    .first()
    .click();
}
async function prepare(page: Page) {
  await page.goto("/app");
  await page.getByRole("button", { name: "Na razie pomiń" }).click();
  await address(page, "Skąd", "Długa 12");
  await address(page, "Dokąd", "Rynek Główny 1");
}
async function calculate(page: Page) {
  const response = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/route") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Wyznacz trasę", exact: true })
    .click();
  const result = await response;
  expect(result.ok()).toBe(true);
  await expect(
    page.getByRole("heading", { name: "Przebieg trasy" }),
  ).toBeVisible();
  return result.json();
}

test("a real nearby rest stop appends after existing stops without replacing the destination", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(page);
  await page
    .getByRole("button", { name: "Dodaj przystanek", exact: true })
    .click();
  await address(page, "Przystanek 1", "Długa 4");
  const original = await Promise.all(
    ["Skąd", "Dokąd", "Przystanek 1"].map((label) =>
      page.getByRole("combobox", { name: label, exact: true }).inputValue(),
    ),
  );
  const firstRoute = await calculate(page);
  expect(firstRoute.stopSuggestions.length).toBeGreaterThan(0);
  const suggestion: StopSuggestion = firstRoute.stopSuggestions[0];
  await page.locator(".rest-stops > summary").click();
  const card = page.locator(".rest-stop-card").first();
  await expect(card.getByRole("heading")).toHaveText(suggestion.point.label);
  await expect(card).toContainText("w linii prostej od trasy");
  const originalSummary = await page.locator(".route-summary").innerText();
  await card
    .getByRole("button", { name: "Pokaż miejsce na mapie", exact: true })
    .click();
  await expect(
    page.getByRole("img", {
      name: `Propozycja przystanku: ${suggestion.point.label}`,
      exact: true,
    }),
  ).toBeInViewport();
  await expect(page.locator(".stop-preview-message")).toContainText(
    "Twój plan pozostał bez zmian",
  );
  await page.screenshot({ path: "artifacts/goal-rest-preview-mobile.png" });
  await page
    .getByRole("button", { name: "Zamknij podgląd", exact: true })
    .click();
  await expect(page.locator(".preview-stop-pin")).toHaveCount(0);
  await page.locator(".mobile-map-toggle").click();
  await expect(page.locator(".route-summary")).toHaveText(originalSummary, {
    useInnerText: true,
  });
  await card.locator("summary").click();
  await expect(card).toContainText("Dane mapy");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "artifacts/goal-rest-stops-mobile.png" });
  await card
    .getByRole("button", { name: "Dodaj jako przystanek", exact: true })
    .click();
  await expect(page.locator(".route-change-notice")).toContainText(
    "Dodano przystanek 2",
  );
  for (const [i, label] of ["Skąd", "Dokąd", "Przystanek 1"].entries())
    await expect(
      page.getByRole("combobox", { name: label, exact: true }),
    ).toHaveValue(original[i]);
  await expect(
    page.getByRole("combobox", { name: "Przystanek 2", exact: true }),
  ).toHaveValue(suggestion.point.label);
  await expect(page.locator(".route-summary")).toHaveCount(0);
  const request = page.waitForRequest(
    (r) => r.url().endsWith("/api/route") && r.method() === "POST",
  );
  await calculate(page);
  const body = (await request).postDataJSON();
  expect(body.waypoints).toHaveLength(2);
  expect(body.waypoints[1]).toEqual(suggestion.point.coordinates);
  await expect(page.locator(".route-change-notice")).toHaveCount(0);
});

test("stop suggestions expire, exclude duplicates and respect the five stop limit", async ({
  page,
}) => {
  await prepare(page);
  for (const [i, query] of [
    "Długa 4",
    "Floriańska 44",
    "Floriańska 20",
    "Floriańska 1",
    "Szewska 5",
  ].entries()) {
    await page
      .getByRole("button", { name: "Dodaj przystanek", exact: true })
      .click();
    await address(page, `Przystanek ${i + 1}`, query);
  }
  await page.route("**/api/route", async (route) => {
    const result = await route.fetch();
    const body = await result.json();
    const suggestion = body.stopSuggestions[0];
    expect(suggestion).toBeTruthy();
    const expired = {
      ...suggestion,
      id: "expired",
      kind: "rest_place",
      point: {
        ...suggestion.point,
        id: "expired",
        label: "Nieaktualna propozycja",
      },
      validUntil: "2020-01-01T12:00:00Z",
    };
    const duplicate = {
      ...suggestion,
      id: "duplicate",
      point: {
        ...suggestion.point,
        id: "duplicate",
        label: "Ten sam punkt",
        coordinates: route.request().postDataJSON().start,
      },
    };
    await route.fulfill({
      response: result,
      json: { ...body, stopSuggestions: [suggestion, expired, duplicate] },
    });
  });
  await calculate(page);
  await page.locator(".rest-stops > summary").click();
  await expect(
    page.getByText(
      "Masz już 5 przystanków. Usuń jeden w polach adresów, aby dodać inny.",
    ),
  ).toBeVisible();
  await expect(page.locator(".rest-stop-card")).toHaveCount(2);
  await expect(
    page.getByRole("heading", { name: "Nieaktualna propozycja" }),
  ).toHaveCount(0);
  await expect(
    page
      .locator(".rest-stop-card")
      .first()
      .getByRole("button", { name: "Dodaj jako przystanek", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Już w Twoim planie" }),
  ).toBeDisabled();
});

test("a community discovery can be a stop while preserving the current destination", async ({
  page,
}) => {
  const observedAt = new Date().toISOString();
  await page.route("**/api/observations", (route) =>
    route.fulfill({
      json: {
        observations: [
          {
            id: "rest-fixture",
            type: "rest_place",
            label: "Miejsce odpoczynku",
            coordinates: [19.9392, 50.063],
            description: "Miejsce ze stabilną ławką zauważone podczas spaceru.",
            observedAt,
            validUntil: new Date(Date.now() + 86400000).toISOString(),
            status: "active",
            isMine: false,
            stale: false,
          },
        ],
      },
    }),
  );
  await prepare(page);
  const destination = await page
    .getByRole("combobox", { name: "Dokąd", exact: true })
    .inputValue();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Wspólnie", exact: true })
    .click();
  await page
    .locator(".good-discovery")
    .getByRole("button", { name: "Dodaj jako przystanek", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Dokąd", exact: true }),
  ).toHaveValue(destination);
  await expect(
    page.getByRole("combobox", { name: "Przystanek 1", exact: true }),
  ).toHaveValue("Miejsce odpoczynku");
  await expect(page.locator(".route-change-notice")).toContainText(
    "Dodano przystanek 1",
  );
});
