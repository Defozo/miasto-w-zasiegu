import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function address(
  page: Page,
  label: string,
  query: string,
  expected: RegExp,
) {
  await page.getByRole("combobox", { name: label, exact: true }).fill(query);
  await page
    .getByRole("listbox", { name: `Podpowiedzi: ${label}` })
    .getByRole("option", { name: expected })
    .first()
    .click();
}
async function inputs(page: Page) {
  await address(page, "Skąd", "Długa 12", /Długa 12, Kraków/);
  await address(page, "Dokąd", "Rynek Główny 1", /Rynek Główny 1, Kraków/);
}
async function axe(page: Page) {
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
}
async function start(page: Page) {
  await page.goto("/app");
  await page.getByRole("button", { name: "Na razie pomiń" }).click();
}
test("landing, pause motion and direct route planning", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Sprawdź.*wejście.*i trasę/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Zatrzymaj animację trasy" }).click();
  await axe(page);
  await page
    .getByRole("link", { name: "Zaplanuj trasę", exact: false })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Dokąd ruszamy?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Skąd", exact: true }),
  ).toBeVisible();
});
test("skip onboarding; real addresses, waypoint, route and saved offline plan", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await start(page);
  await expect(
    page.getByRole("button", { name: "Wyznacz trasę" }),
  ).toBeDisabled();
  await inputs(page);
  await page.getByRole("button", { name: "Dodaj przystanek" }).click();
  await expect(
    page.getByRole("button", { name: "Wyznacz trasę" }),
  ).toBeDisabled();
  await address(page, "Przystanek 1", "Brama Floriańska", /Brama Floriańska/);
  const requested = page.waitForRequest(
    (r) => r.url().endsWith("/api/route") && r.method() === "POST",
  );
  await page.getByRole("button", { name: "Wyznacz trasę" }).click();
  expect((await requested).postDataJSON().waypoints).toHaveLength(1);
  await expect(
    page.getByRole("heading", { name: "Przebieg trasy" }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".map-section")).toHaveAttribute(
    "data-map-ready",
    "true",
    { timeout: 20000 },
  );
  await expect(
    page.getByRole("img", { name: "Początek trasy", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: /^Cel trasy: Rynek Główny 1/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: /^Przystanek 1: Brama Floriańska/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Filtry mapy", exact: true }).click();
  const filters = page.getByRole("dialog", {
    name: "Filtry mapy",
    exact: true,
  });
  await filters
    .getByRole("checkbox", { name: "Miejsca na mapie", exact: true })
    .uncheck();
  await filters
    .getByRole("button", { name: "Pokaż wyniki", exact: true })
    .click();
  await expect(page.locator(".place-pin")).toHaveCount(0);
  await page.getByRole("button", { name: "Pokaż całą trasę" }).click();
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
  expect(
    (await page.locator(".map-canvas").boundingBox())!.height,
  ).toBeGreaterThan(400);
  await expect(page.locator(".uncertainty")).toContainText(
    "przejezdność nie jest potwierdzona",
  );
  await page.getByRole("button", { name: "Zapisz plan", exact: true }).click();
  await page.screenshot({ path: "artifacts/v2-route-desktop.png" });
  await axe(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByText("Jesteś offline.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Otwórz zapisaną trasę" }).click();
  await expect(
    page.getByRole("heading", { name: "Przebieg trasy" }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Przystanek 1" }),
  ).toHaveValue(/Brama Floriańska/);
  await expect(
    page.getByRole("button", { name: "Przelicz trasę" }),
  ).toBeDisabled();
  expect(errors).toEqual([]);
});
test("editing an address invalidates coordinates; stops reorder and can be removed", async ({
  page,
}) => {
  await start(page);
  await inputs(page);
  await page.getByRole("button", { name: "Dodaj przystanek" }).click();
  await address(page, "Przystanek 1", "Teatr 38", /Teatr 38/);
  await page.getByRole("button", { name: "Dodaj przystanek" }).click();
  await address(page, "Przystanek 2", "Brama Floriańska", /Brama Floriańska/);
  await page.getByRole("button", { name: "Przystanek 2: wcześniej" }).click();
  await expect(
    page.getByRole("combobox", { name: "Przystanek 1" }),
  ).toHaveValue(/Brama Floriańska/);
  await page.getByRole("button", { name: "Usuń przystanek 2" }).click();
  await expect(
    page.getByRole("combobox", { name: "Przystanek 2" }),
  ).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Skąd", exact: true })
    .fill("Nieznany adres");
  await expect(
    page.getByRole("button", { name: "Wyznacz trasę" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("combobox", { name: "Skąd", exact: true }),
  ).toHaveValue("Nieznany adres");
});
test("profile sync between two independent browsers and logout privacy", async ({
  page,
  browser,
}) => {
  const email = `sync-${Date.now()}@example.test`,
    password = "przejscie-test-2026";
  // This checks profile sync with an isolated identity fixture, not real OAuth.
  expect((await page.request.post('/api/auth/register', {
    data: { email, password, displayName: 'Test synchronizacji' },
  })).ok()).toBeTruthy();
  await page.goto("/app?konto=1");
  await expect(
    page.getByRole("heading", { name: "Cześć, Test synchronizacji." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Twój profil", exact: true }).click();
  await page.getByLabel("Szerokość z wystającymi elementami").fill("68");
  await page.getByRole("button", { name: "Zapisz preferencje" }).click();
  await expect(
    page.getByRole("button", { name: "Zapisano preferencje" }),
  ).toBeVisible();
  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  expect((await other.request.post('http://127.0.0.1:4174/api/auth/login', {
    data: { email, password },
  })).ok()).toBeTruthy();
  await other.goto("http://127.0.0.1:4174/app?konto=1");
  await expect(
    other.getByRole("heading", { name: "Cześć, Test synchronizacji." }),
  ).toBeVisible();
  await other.getByRole("button", { name: "Twój profil", exact: true }).click();
  await expect(
    other.getByLabel("Szerokość z wystającymi elementami"),
  ).toHaveValue("68");
  await other.getByLabel("Szerokość z wystającymi elementami").fill("70");
  await other.getByRole("button", { name: "Zapisz preferencje" }).click();
  await expect(
    other.getByRole("button", { name: "Zapisano preferencje" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Twój profil", exact: true }).click();
  await expect(
    page.getByLabel("Szerokość z wystającymi elementami"),
  ).toHaveValue("70");
  await page.getByRole("button", { name: "Konto", exact: true }).click();
  await page
    .getByRole("button", { name: "Wyloguj się z tego urządzenia" })
    .click();
  await page.getByRole("button", { name: "Twój profil", exact: true }).click();
  await expect(
    page.getByLabel("Szerokość z wystającymi elementami"),
  ).toHaveValue("");
  await ctx.close();
});
test("mobile forms, plain language, report and return from map", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  await inputs(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({ path: "artifacts/v2-route-mobile.png" });
  await axe(page);
  await page.getByRole("button", { name: "Odkrywaj", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Dokąd dziś?" }),
  ).toBeVisible();
  await expect(page.locator(".place-card").first()).toBeVisible();
  expect(await page.locator(".content-panel").innerText()).not.toMatch(
    /\bOSM\b/,
  );
  await page.getByRole("button", { name: "Wspólnie", exact: true }).click();
  await page
    .getByRole("button", { name: "Dodaj obserwację", exact: true })
    .click();
  await page
    .getByLabel("Krótki opis")
    .fill("Test w osobnej bazie: hulajnoga blokuje chodnik przy wejściu.");
  await page.getByRole("button", { name: "Wskaż na mapie" }).click();
  await page.getByRole("button", { name: "Wróć do formularza" }).click();
  await expect(page.getByLabel("Krótki opis")).toHaveValue(/hulajnoga/);
  await page.getByLabel("Miejsce obserwacji").selectOption({ index: 1 });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Dodaj obserwację", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Mapa wie trochę więcej." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Wróć do mapy" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Wspólnie", exact: true }).click();
  await expect(page.locator(".report-card").first()).toContainText("hulajnoga");
  await page
    .getByRole("button", { name: "Potwierdzam, że problem usunięto" })
    .first()
    .click();
  await expect(page.locator(".report-status").first()).toHaveText(
    "Oznaczona jako usunięta",
  );
});
test("routing failure and unavailable internet lookup remain actionable", async ({
  page,
}) => {
  await start(page);
  await inputs(page);
  await page.route("**/api/route", (r) =>
    r.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: { message: "Wyznaczanie trasy jest chwilowo niedostępne." },
      }),
    }),
  );
  await page.getByRole("button", { name: "Wyznacz trasę" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Wyznaczanie trasy jest chwilowo niedostępne",
  );
  await expect(page.locator(".route-result")).toHaveCount(0);
  await page.getByRole("button", { name: "Twój profil", exact: true }).click();
  await page
    .getByLabel("Producent i model wózka")
    .fill("Nieznany testowy model");
  await page
    .getByRole("button", { name: "Poszukaj w dokumentacji producenta" })
    .click();
  await expect(
    page.getByText("Wyszukiwanie dokumentacji jest obecnie niedostępne.", {
      exact: false,
    }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByLabel("Szerokość z wystającymi elementami"),
  ).toHaveValue("");
  await axe(page);
});
