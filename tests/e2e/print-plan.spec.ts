import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { SavedRoute } from "../../web/src/types";

const STORAGE = "przejscie-saved-route";

async function address(page: Page, label: string, query: string) {
  const input = page.getByRole("combobox", { name: label, exact: true });
  await input.fill(query);
  await page
    .getByRole("listbox", { name: `Podpowiedzi: ${label}` })
    .getByRole("option")
    .first()
    .click();
  return input.inputValue();
}

async function routePlan(page: Page, withStops = false) {
  await page.goto("/app");
  const skip = page.getByRole("button", { name: "Na razie pomiń" });
  if (await skip.isVisible()) await skip.click();
  const start = await address(page, "Skąd", "Długa 12");
  const end = await address(page, "Dokąd", "Rynek Główny 1");
  const via: string[] = [];
  if (withStops) {
    for (const [index, query] of ["Długa 4", "Floriańska 20"].entries()) {
      await page
        .getByRole("button", { name: "Dodaj przystanek", exact: true })
        .click();
      via.push(await address(page, `Przystanek ${index + 1}`, query));
    }
  }
  await page
    .getByRole("button", { name: "Wyznacz trasę", exact: true })
    .click();
  await expect(page.locator(".route-result")).toBeVisible();
  return { start, end, via };
}

test("printing keeps the screen intact and produces only a readable plan with long addresses, stops and instructions", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "przejscie-profile",
      JSON.stringify({
        mobility: "manual",
        widthCm: "69.5",
        maxIncline: "5",
        maxKerbCm: "1",
        avoidUnpaved: true,
      }),
    );
    (window as unknown as { __printCalls: number }).__printCalls = 0;
    window.print = () => {
      (window as unknown as { __printCalls: number }).__printCalls++;
    };
  });
  // Controlled long labels exercise wrapping without changing real coordinates
  // or starting any external route/research provider in the isolated server.
  await page.route("**/api/locations?**", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.locations = data.locations.map((point: { label: string }) => ({
      ...point,
      label: `${point.label}, test długiej nazwy: Przestrzeń Sąsiedzka imienia Marii Skłodowskiej-Curie, dziedziniec przy ulicy Świętego Józefa, Kraków`,
    }));
    await route.fulfill({ response, json: data });
  });
  await page.route("**/api/route", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.source.computedAt = "2026-09-20T08:05:00.000Z";
    data.steps = Array.from({ length: 18 }, (_, index) => ({
      instruction: `Instrukcja testowa ${index + 1}: kieruj się w stronę ulicy Świętego Józefa. Przy skrzyżowaniu sprawdź oznaczenia i dalszy przebieg chodnika.`,
      distanceM: index * 10 + 25,
      wayPoints: [0, 1],
    }));
    data.warnings.push(
      "Kontrolowany przykład: brak pomiaru szerokości wejścia.",
    );
    await route.fulfill({ response, json: data });
  });
  const points = await routePlan(page, true);
  const print = page.getByRole("button", {
    name: "Wydrukuj plan",
    exact: true,
  });
  const document = page.locator(".print-plan-document");
  await expect(document).toBeHidden();
  await expect(print).toHaveAccessibleDescription(
    "Papier lub PDF, z adresami i potrzebami.",
  );
  await print.focus();
  await page.keyboard.press("Enter");
  expect(
    await page.evaluate(
      () => (window as unknown as { __printCalls: number }).__printCalls,
    ),
  ).toBe(1);
  await expect(page.locator(".route-result")).toBeVisible();
  await expect(document).toBeHidden();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);

  await page.emulateMedia({ media: "print" });
  await expect(document).toBeVisible();
  await expect(page.locator("#root")).toBeHidden();
  await expect(page.locator(".map-section")).toBeHidden();
  await expect(print).toBeHidden();
  await expect(document.locator("button, input, form, canvas, a")).toHaveCount(
    0,
  );
  await expect(
    document.locator(".print-plan-point > div > p:first-of-type"),
  ).toHaveText([points.start, ...points.via, points.end]);
  await expect(document.locator(".print-plan-date")).toContainText(
    "20 września 2026",
  );
  await expect(document.locator(".print-plan-date")).toContainText("10:05");
  await expect(document.locator(".print-plan-profile")).toContainText(
    "69,5 cm",
  );
  await expect(document.locator(".print-plan-profile")).toContainText("5 %");
  await expect(document.locator(".print-plan-steps > li")).toHaveCount(18);
  await expect(document.locator(".print-plan-steps > li").last()).toContainText(
    "Instrukcja testowa 18",
  );
  await expect(document).toContainText(
    "Przejezdność całej trasy nie jest potwierdzona",
  );
  await expect(document).toContainText("Nie pokazuje Twojej pozycji GPS");
  await expect(document).toContainText("brak pomiaru szerokości wejścia");
  expect(
    await document.evaluate((element) => getComputedStyle(element).fontSize),
  ).toBe("15.3333px");
  await page.setViewportSize({ width: 794, height: 1123 });
  expect(
    await document.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/print-plan-layout.png",
    fullPage: true,
  });
  const pdf = await page.pdf({
    path: "artifacts/print-plan-example.pdf",
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: false,
  });
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.byteLength).toBeGreaterThan(5000);
  await testInfo.attach("Wydruk planu A4", {
    body: pdf,
    contentType: "application/pdf",
  });
  await page.emulateMedia({ media: "screen" });
  await expect(document).toBeHidden();
  await expect(page.locator("#root")).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Skąd", exact: true }),
  ).toHaveValue(points.start);
});

test("printing an older saved plan keeps its own needs and marks the calculation date as unknown", async ({
  page,
}) => {
  await routePlan(page);
  await page.getByRole("button", { name: "Zapisz plan", exact: true }).click();
  await page.evaluate((key) => {
    const saved = JSON.parse(localStorage.getItem(key)!);
    delete saved.route.source.computedAt;
    saved.profile.widthCm = "81";
    saved.savedAt = "2024-01-01T12:00:00Z";
    localStorage.setItem(key, JSON.stringify(saved));
    localStorage.setItem(
      "przejscie-profile",
      JSON.stringify({
        mobility: "manual",
        widthCm: "62",
        maxIncline: "6",
        maxKerbCm: "2",
        avoidUnpaved: false,
      }),
    );
  }, STORAGE);
  await page.reload();
  await page
    .getByRole("button", { name: "Otwórz zapisaną trasę", exact: true })
    .click();
  await page.emulateMedia({ media: "print" });
  const document = page.locator(".print-plan-document");
  await expect(document).toBeVisible();
  await expect(document.locator(".print-plan-date")).toHaveText(
    "Data obliczenia trasy jest nieznana.",
  );
  await expect(document.locator(".print-plan-saved")).toContainText(
    "Trasa nie została ponownie przeliczona",
  );
  await expect(document.locator(".print-plan-profile")).toContainText("81 cm");
  await expect(document.locator(".print-plan-profile")).not.toContainText(
    "62 cm",
  );
  await expect(document.locator(".print-plan-date")).not.toContainText("2024");
});

test("locking an opened private plan removes its printable copy and addresses from the DOM", async ({
  page,
  context,
}) => {
  const registration = await page.request.post("/api/auth/register", {
    data: {
      email: `print-private-${Date.now()}@example.invalid`,
      password: "Isolated-print-plan-password-2026!",
      displayName: "Prywatny test wydruku",
    },
  });
  expect(registration.status()).toBe(201);
  const { start, end } = await routePlan(page);
  await page.getByRole("button", { name: "Zapisz plan", exact: true }).click();
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!) as SavedRoute,
    STORAGE,
  );
  expect(saved.scope).toBe("account");
  await page.reload();
  await page
    .getByRole("button", { name: "Otwórz zapisaną trasę", exact: true })
    .click();
  await expect(page.locator(".print-plan-document")).toHaveCount(1);
  await expect(page.locator(".print-plan-document")).toContainText(start);
  await expect(page.locator(".print-plan-document")).toContainText(end);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".print-plan-document")).toBeVisible();
  await context.setOffline(true);
  await expect(page.locator(".print-plan-document")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Wydrukuj plan", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(start);
  await expect(page.locator("body")).not.toContainText(end);
  await expect(page.locator("#root")).toBeVisible();
});
