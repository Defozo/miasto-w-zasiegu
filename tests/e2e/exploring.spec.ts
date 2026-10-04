import { test, expect, type Page } from "@playwright/test";

async function address(page: Page, label: string, query: string) {
  await page.getByRole("combobox", { name: label, exact: true }).fill(query);
  await page
    .getByRole("listbox", { name: `Podpowiedzi: ${label}` })
    .getByRole("option")
    .first()
    .click();
}

test("a route fits the mobile map when it opens after planning in the list", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app");
  await page.getByRole("button", { name: "Na razie pomiń" }).click();
  await address(page, "Skąd", "Długa 12");
  await address(page, "Dokąd", "Rynek Główny 1");
  await page
    .getByRole("button", { name: "Wyznacz trasę", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Przebieg trasy" }),
  ).toBeVisible();
  await page.locator(".mobile-map-toggle").click();
  await expect(
    page.getByRole("img", { name: "Początek trasy", exact: true }),
  ).toBeInViewport();
  await expect(page.getByRole("img", { name: /^Cel trasy:/ })).toBeInViewport();
  await expect
    .poll(async () => {
      const destination = await page
        .getByRole("img", { name: /^Cel trasy:/ })
        .boundingBox();
      const legend = await page.locator(".map-legend").boundingBox();
      return Boolean(
        destination && legend && destination.y + destination.height < legend.y,
      );
    })
    .toBe(true);
  await page
    .getByRole("button", { name: "Przybliż mapę", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Pokaż całą trasę", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "Początek trasy", exact: true }),
  ).toBeInViewport();
  await expect
    .poll(async () => {
      const destination = await page
        .getByRole("img", { name: /^Cel trasy:/ })
        .boundingBox();
      const legend = await page.locator(".map-legend").boundingBox();
      return Boolean(
        destination && legend && destination.y + destination.height < legend.y,
      );
    })
    .toBe(true);
  await page.screenshot({ path: "artifacts/goal-route-map-mobile.png" });
  await page.locator(".mobile-map-toggle").click();
  await expect(
    page.getByRole("combobox", { name: "Dokąd", exact: true }),
  ).toHaveValue(/^Rynek Główny 1/);
  await expect(page.locator(".route-summary")).toBeVisible();
});

test("browsing places preserves the journey until the user explicitly chooses a new destination", async ({
  page,
}) => {
  await page.goto("/app");
  await page.getByRole("button", { name: "Na razie pomiń" }).click();
  await address(page, "Skąd", "Długa 12");
  await address(page, "Dokąd", "Rynek Główny 1");
  const originalEnd = await page
    .getByRole("combobox", { name: "Dokąd", exact: true })
    .inputValue();
  await page
    .getByRole("button", { name: "Wyznacz trasę", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Przebieg trasy" }),
  ).toBeVisible();
  const summary = await page.locator(".route-summary").innerText();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Odkrywaj", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Dokąd dziś?" }),
  ).toBeVisible();
  await page.getByLabel("Szukaj miejsca w Krakowie").fill("Teatr");
  await page.locator(".place-card").first().click();
  const placeName = await page.locator(".place-detail h1").innerText();
  await page.getByRole("button", { name: "Wszystkie miejsca" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Twoja trasa", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Dokąd", exact: true }),
  ).toHaveValue(originalEnd);
  await expect(page.locator(".route-summary")).toHaveText(summary, {
    useInnerText: true,
  });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Odkrywaj", exact: true })
    .click();
  await page.locator(".place-card").first().click();
  await page
    .getByRole("button", { name: "Zaplanuj przejście", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Dokąd", exact: true }),
  ).toHaveValue(placeName);
  await expect(
    page.getByRole("combobox", { name: "Skąd", exact: true }),
  ).toHaveValue(/^Długa 12/);
  await expect(page.locator(".route-summary")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Wyznacz trasę", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Przebieg trasy" }),
  ).toBeVisible();
});

test("a gateway error is readable and a second route attempt works", async ({
  page,
}) => {
  await page.goto("/app");
  await page.getByRole("button", { name: "Na razie pomiń" }).click();
  await address(page, "Skąd", "Długa 12");
  await address(page, "Dokąd", "Rynek Główny 1");
  await page.route(
    "**/api/route",
    (route) =>
      route.fulfill({
        status: 502,
        contentType: "text/html",
        body: "<html><h1>Bad Gateway</h1></html>",
      }),
    { times: 1 },
  );
  await page
    .getByRole("button", { name: "Wyznacz trasę", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Usługa jest chwilowo niedostępna",
  );
  await expect(page.getByRole("alert")).not.toContainText(
    /JSON|SyntaxError|Unexpected|Gateway/,
  );
  await expect(
    page.getByRole("combobox", { name: "Skąd", exact: true }),
  ).toHaveValue(/^Długa 12/);
  await page
    .getByRole("button", { name: "Wyznacz trasę", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Przebieg trasy" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("resaving an old plan keeps its actual calculation date and deletion needs a deliberate confirmation", async ({
  page,
}) => {
  await page.goto("/app");
  await page.getByRole("button", { name: "Na razie pomiń" }).click();
  await address(page, "Skąd", "Długa 12");
  await address(page, "Dokąd", "Rynek Główny 1");
  await page
    .getByRole("button", { name: "Wyznacz trasę", exact: true })
    .click();
  await page.getByRole("button", { name: "Zapisz plan", exact: true }).click();
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("przejscie-saved-route")!);
    saved.route.source.computedAt = "2020-01-01T12:00:00Z";
    localStorage.setItem("przejscie-saved-route", JSON.stringify(saved));
  });
  await page.reload();
  await expect(page.locator(".saved-plan-age")).toContainText("2020");
  await page.getByRole("button", { name: "Otwórz zapisaną trasę" }).click();
  await expect(page.locator(".route-result .notice").first()).toContainText(
    "2020",
  );
  await page.getByRole("button", { name: "Zapisz plan", exact: true }).click();
  await expect(page.locator(".route-result .notice").first()).toContainText(
    "2020",
  );
  await page.getByRole("button", { name: "Usuń zapisany plan" }).click();
  await page.getByRole("button", { name: "Zachowaj plan" }).click();
  expect(
    await page.evaluate(() => localStorage.getItem("przejscie-saved-route")),
  ).not.toBeNull();
  await page.getByRole("button", { name: "Usuń zapisany plan" }).click();
  await page.getByRole("button", { name: "Tak, usuń zapis" }).click();
  await expect(page.locator(".saved-plan")).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("przejscie-saved-route")),
  ).toBeNull();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Otwórz zapisaną trasę" }),
  ).toHaveCount(0);
});
