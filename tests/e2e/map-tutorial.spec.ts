import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.use({ storageState: { cookies: [], origins: [] } });

const tutorialKey = "przejscie-map-tutorial-v1";
const tour = (page: Page) =>
  page.getByRole("dialog", { name: "Przewodnik po mapie" });

test.beforeEach(async ({ page }) => {
  // Isolated UI fixtures. These observations are never written to a service.
  await page.route(/\/api\/places(?:\?|$)/, (route) =>
    route.fulfill({
      json: {
        places: [
          {
            id: "tutorial-fixture",
            name: "Muzeum testowe",
            category: "culture",
            coordinates: [19.938, 50.061],
            description: "Przykładowe dane testu interfejsu",
            access: {
              wheelchair: "unknown",
              widthCm: null,
              surface: null,
              toilet: "unknown",
              entranceNotes: "",
            },
            sourceUrl: "https://example.test",
            sourceLabel: "Dane testowe",
            verifiedAt: null,
          },
        ],
        total: 1,
      },
    }),
  );
  await page.route("https://tiles.openfreemap.org/styles/positron", (route) =>
    route.fulfill({
      json: {
        version: 8,
        sources: {},
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#edf1df" },
          },
        ],
      },
    }),
  );
});

async function enterMap(page: Page) {
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "Jak się poruszasz?" }),
  ).toBeVisible({ timeout: 20000 });
  await expect(tour(page)).toHaveCount(0);
  await page
    .getByRole("button", { name: "Pomiń na razie", exact: true })
    .click();
  await expect(tour(page)).toBeVisible();
}

test("opens after setup, skips, remembers the choice and restores keyboard focus", async ({
  page,
}) => {
  await enterMap(page);
  await expect(tour(page).getByRole("heading")).toBeFocused();
  await tour(page).getByRole("button", { name: "Pomiń tutorial" }).click();
  await expect(tour(page)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Przewodnik po mapie" }),
  ).toBeFocused();
  await expect(
    page.getByRole("combobox", { name: "Miejsce lub adres", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!),
      tutorialKey,
    ),
  ).toBe("skipped");
  await page.reload();
  await expect(page.locator(".place-card")).toBeVisible();
  await expect(tour(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Przewodnik po mapie" }).click();
  await expect(
    tour(page).getByRole("heading", { name: "Twoje miasto. Twoje tempo." }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tour(page)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Przewodnik po mapie" }),
  ).toBeFocused();
});

test("all four steps, previous navigation, spotlight and completion work with the keyboard", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await enterMap(page);
  // Shift-Tab from the introductory heading wraps to the primary action.
  await page.keyboard.press("Shift+Tab");
  await expect(
    tour(page).getByRole("button", { name: "Pokaż mi mapę" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    tour(page).getByRole("button", { name: "Pomiń tutorial" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Enter");
  await expect(
    tour(page).getByRole("heading", { name: "Na co masz dziś ochotę?" }),
  ).toBeFocused();
  await expect(tour(page).locator(".map-tour-spotlight")).toBeVisible();
  await tour(page).getByRole("button", { name: "Wstecz" }).click();
  await expect(
    tour(page).getByRole("heading", { name: "Twoje miasto. Twoje tempo." }),
  ).toBeFocused();
  await tour(page)
    .getByRole("button", { name: "Krok 3: Sprawdź warunki" })
    .click();
  await expect(tour(page)).toContainText(
    "Brak danych nie oznacza braku bariery.",
  );
  await tour(page).getByRole("button", { name: "Dalej", exact: true }).click();
  await expect(
    tour(page).getByRole("heading", { name: "Od dobrego miejsca do planu." }),
  ).toBeFocused();
  await tour(page).getByRole("button", { name: "Odkrywam Kraków" }).click();
  await expect(tour(page)).toHaveCount(0);
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!),
      tutorialKey,
    ),
  ).toBe("completed");
  await page.reload();
  await expect(page.locator(".place-card")).toBeVisible();
  await expect(tour(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("replaying keeps the existing destination and route form", async ({ page }) => {
  await enterMap(page);
  await tour(page).getByRole("button", { name: "Pomiń tutorial" }).click();
  await page.locator(".place-card").click();
  await page.getByRole("button", { name: "Nawiguj", exact: true }).click();
  const start = page.getByRole("combobox", { name: /Skąd/ }).first();
  await start.fill("Mój punkt początkowy");
  await page.getByRole("button", { name: "Przewodnik po mapie" }).click();
  await tour(page).getByRole("button", { name: "Krok 4: Zaplanuj i ruszaj" }).click();
  await tour(page).getByRole("button", { name: "Odkrywam Kraków" }).click();
  await expect(start).toHaveValue("Mój punkt początkowy");
  await expect(page.getByRole("button", { name: "Auto + dalszy odcinek", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: /Dokąd/ }).first()).toHaveValue("Muzeum testowe");
});

test("automated accessibility checks pass on every step", async ({ page }) => {
  await enterMap(page);
  for (let index = 0; index < 4; index++) {
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(result.violations).toEqual([]);
    if (index < 3) await tour(page).locator(".map-tour-next").click();
  }
});

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`fits ${viewport.width}x${viewport.height} with large text and reduced motion`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      localStorage.setItem(
        "przejscie-display-v1",
        JSON.stringify({
          largeText: true,
          highContrast: true,
          reduceMotion: true,
        }),
      );
    });
    await enterMap(page);
    for (let index = 0; index < 4; index++) {
      expect(
        await tour(page).evaluate((node) => node.scrollWidth <= innerWidth),
      ).toBe(true);
      const skip = tour(page).getByRole("button", { name: "Pomiń tutorial" });
      const next = tour(page).locator(".map-tour-next");
      await expect(skip).toBeInViewport({ ratio: 1 });
      await expect(next).toBeInViewport({ ratio: 1 });
      expect(
        await tour(page)
          .locator(".map-tour-pin, .map-tour-route")
          .evaluateAll((nodes) =>
            nodes.every(
              (node) => getComputedStyle(node).animationName === "none",
            ),
          ),
      ).toBe(true);
      await page.screenshot({
        path: `artifacts/map-tutorial/${viewport.width}-step${index + 1}.png`,
      });
      await next.click();
    }
    await expect(tour(page)).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Przewodnik po mapie" }),
    ).toBeInViewport({ ratio: 1 });
  });
}

test("can dismiss when local storage is blocked", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Blocked by test", "SecurityError");
    };
  });
  await enterMap(page);
  await page.keyboard.press("Escape");
  await expect(tour(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Toalety", exact: true }).click();
  await expect(tour(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Przewodnik po mapie" }).click();
  await expect(tour(page)).toBeVisible();
  await tour(page).getByRole("button", { name: "Pomiń tutorial" }).click();
  await expect(tour(page)).toHaveCount(0);
});

test("does not interrupt the account page and starts on return to the map", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("przejscie-onboarding", JSON.stringify("skipped")),
  );
  await page.goto("/app?konto");
  await expect(
    page.getByRole("button", { name: "Mapa", exact: true }),
  ).toBeVisible();
  await expect(tour(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Mapa", exact: true }).click();
  await expect(tour(page)).toBeVisible();
});

test("unavailable map tiles and empty places do not block the tutorial", async ({
  page,
}) => {
  await page.route(/\/api\/places(?:\?|$)/, (route) =>
    route.fulfill({ json: { places: [], total: 0 } }),
  );
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    route.abort(),
  );
  await enterMap(page);
  await tour(page)
    .getByRole("button", { name: "Krok 3: Sprawdź warunki" })
    .click();
  await expect(tour(page)).toContainText(
    "Brak danych nie oznacza braku bariery.",
  );
  await expect(tour(page).locator(".map-tour-shade")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", { name: "Nie znaleźliśmy takiego miejsca." }),
  ).toBeVisible();
});
