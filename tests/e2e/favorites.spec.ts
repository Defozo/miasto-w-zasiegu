import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function start(page: Page) {
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "Dokąd ruszamy?" }),
  ).toBeVisible();
  const skip = page.getByRole("button", { name: "Na razie pomiń" });
  if (await skip.isVisible()) await skip.click();
}
async function address(page: Page, label: string, query: string) {
  await page.getByRole("combobox", { name: label, exact: true }).fill(query);
  await page
    .getByRole("listbox", { name: `Podpowiedzi: ${label}` })
    .getByRole("option", { name: new RegExp(`^${query}, Kraków`) })
    .first()
    .click();
}
async function saveHome(page: Page) {
  await address(page, "Skąd", "Długa 12");
  await page
    .getByRole("button", { name: "Zapisz miejsce: Skąd", exact: true })
    .click();
  await page.getByRole("button", { name: "Dom", exact: true }).click();
  await page
    .getByRole("button", { name: "Zapisz miejsce", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Miejsce, do którego wracasz" }),
  ).toBeHidden();
}

test("saved guest places work without typing, remain local, and can be removed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  await saveHome(page);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Ustaw potrzeby do planowania trasy" }),
  ).toHaveCount(0);
  await page.getByRole("combobox", { name: "Skąd", exact: true }).click();
  await expect(
    page.getByRole("option", { name: /^Dom Długa 12, Kraków/ }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Skąd", exact: true })
    .press("ArrowDown");
  await page
    .getByRole("combobox", { name: "Skąd", exact: true })
    .press("Enter");
  await expect(
    page.getByRole("combobox", { name: "Skąd", exact: true }),
  ).toHaveValue(/^Długa 12, Kraków/);
  await page.locator(".saved-places summary").click();
  await page.getByRole("button", { name: "Dom: ustaw jako cel" }).click();
  await expect(
    page.getByRole("combobox", { name: "Dokąd", exact: true }),
  ).toHaveValue(/^Długa 12, Kraków/);
  await expect(
    page.getByText("Zapisane tylko w tej przeglądarce.", { exact: false }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({ path: "artifacts/goal-favorites-mobile.png" });
  await page
    .getByRole("button", { name: "Usuń zapisane miejsce: Dom" })
    .click();
  await page.getByRole("button", { name: "Zachowaj", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Dom: ustaw jako cel" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Usuń zapisane miejsce: Dom" })
    .click();
  await page.getByRole("button", { name: "Usuń", exact: true }).click();
  await page.reload();
  await page.getByRole("combobox", { name: "Skąd", exact: true }).click();
  await expect(
    page.getByRole("option", { name: /^Dom Długa 12, Kraków/ }),
  ).toHaveCount(0);
});

test("account places transfer between browsers and private route points clear on logout", async ({
  page,
  browser,
}) => {
  const email = `favorites-${Date.now()}@example.test`,
    password = "Isolated-test-password-72";
  await page.request.post("/api/auth/register", {
    data: { email, password, displayName: "Próba miejsc" },
  });
  await start(page);
  await saveHome(page);
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4174",
  });
  const second = await context.newPage();
  await second.request.post("/api/auth/login", { data: { email, password } });
  await start(second);
  await second.getByRole("combobox", { name: "Dokąd", exact: true }).click();
  await second.getByRole("option", { name: /^Dom Długa 12, Kraków/ }).click();
  await expect(
    second.getByRole("combobox", { name: "Dokąd", exact: true }),
  ).toHaveValue(/^Długa 12, Kraków/);
  await page.getByRole("button", { name: "Dodaj przystanek" }).click();
  await page
    .getByRole("combobox", { name: "Przystanek 1", exact: true })
    .fill("Prywatny niezatwierdzony adres");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Konto", exact: true })
    .click();
  await page.getByRole("button", { name: "Wyloguj", exact: false }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Twoja trasa", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Skąd", exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByRole("combobox", { name: "Dokąd", exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByRole("combobox", { name: "Przystanek 1", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("combobox", { name: "Skąd", exact: true }).click();
  await expect(
    page.getByRole("option", { name: /^Dom Długa 12, Kraków/ }),
  ).toHaveCount(0);
  await second.reload();
  await second.getByRole("combobox", { name: "Dokąd", exact: true }).click();
  await expect(
    second.getByRole("option", { name: /^Dom Długa 12, Kraków/ }),
  ).toBeVisible();
  await context.close();
});

test("unconfirmed stop drafts follow their stop on remove and reorder", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("button", { name: "Dodaj przystanek" }).click();
  await page.getByRole("button", { name: "Dodaj przystanek" }).click();
  await page
    .getByRole("combobox", { name: "Przystanek 1", exact: true })
    .fill("Kazimierz");
  await page
    .getByRole("combobox", { name: "Przystanek 2", exact: true })
    .fill("Podgórze");
  await page
    .getByRole("button", { name: "Przystanek 2: wcześniej", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Przystanek 1", exact: true }),
  ).toHaveValue("Podgórze");
  await expect(
    page.getByRole("combobox", { name: "Przystanek 2", exact: true }),
  ).toHaveValue("Kazimierz");
  await page
    .getByRole("button", { name: "Usuń przystanek 1", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Przystanek 1", exact: true }),
  ).toHaveValue("Kazimierz");
  await expect(
    page.getByRole("button", { name: "Wyznacz trasę", exact: true }),
  ).toBeDisabled();
});

test("old address results disappear as soon as query changes and dropdown closes on blur", async ({
  page,
}) => {
  await start(page);
  const input = page.getByRole("combobox", { name: "Skąd", exact: true });
  await input.fill("Długa 12");
  await expect(
    page.getByRole("option", { name: /^Długa 12, Kraków/ }).first(),
  ).toBeVisible();
  let release!: () => void;
  const waiting = new Promise<void>((r) => (release = r));
  await page.route("**/api/locations?q=Rynek*", async (route) => {
    await waiting;
    await route.continue();
  });
  await input.fill("Rynek Główny 1");
  await expect(page.getByRole("option", { name: /Długa 12/ })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Dokąd", exact: true }).click();
  await expect(input).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.getByRole("listbox", { name: "Podpowiedzi: Skąd" }),
  ).toHaveCount(0);
  release();
});

test("saved plan keeps its original needs when resaved, and pending GPS cannot replace it", async ({
  page,
}) => {
  await start(page);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Twój profil", exact: true })
    .click();
  await page.getByLabel("Szerokość z wystającymi elementami").fill("70");
  await page.getByRole("button", { name: "Zapisz preferencje" }).click();
  await page.getByRole("button", { name: "Wróć do planowania" }).click();
  await address(page, "Skąd", "Długa 12");
  await address(page, "Dokąd", "Rynek Główny 1");
  await page
    .getByRole("button", { name: "Wyznacz trasę", exact: true })
    .click();
  await page.getByRole("button", { name: "Zapisz plan", exact: true }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Twój profil", exact: true })
    .click();
  await page.getByLabel("Szerokość z wystającymi elementami").fill("90");
  await page.getByRole("button", { name: "Zapisz preferencje" }).click();
  await page.getByRole("button", { name: "Wróć do planowania" }).click();
  await page.evaluate(() => {
    const pending: { callback?: PositionCallback } = {};
    (window as unknown as { __pendingGps: typeof pending }).__pendingGps =
      pending;
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (callback: PositionCallback) =>
          (pending.callback = callback),
      },
    });
  });
  await page
    .getByRole("button", { name: "Użyj mojej lokalizacji", exact: true })
    .click();
  await page.getByRole("button", { name: /Otwórz zapisaną trasę/ }).click();
  await page.evaluate(() => {
    (
      window as unknown as { __pendingGps: { callback: PositionCallback } }
    ).__pendingGps.callback({
      coords: { longitude: 19.95, latitude: 50.06, accuracy: 5 },
      timestamp: Date.now(),
    } as GeolocationPosition);
  });
  await expect(
    page.getByRole("combobox", { name: "Skąd", exact: true }),
  ).toHaveValue(/^Długa 12, Kraków/);
  await expect(
    page.getByRole("button", { name: /70 cm · podjazdy/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Zapisz plan", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: /Otwórz zapisaną trasę/ }).click();
  await expect(
    page.getByRole("button", { name: /70 cm · podjazdy/ }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: /Omijaj niedawno/ }).uncheck();
  await expect(
    page.getByRole("button", { name: /90 cm · podjazdy/ }),
  ).toBeVisible();
  const recalculation = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/route") && request.method() === "POST",
  );
  await page
    .getByRole("button", { name: "Wyznacz trasę", exact: true })
    .click();
  expect((await recalculation).postDataJSON().profile.widthCm).toBe(90);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Twój profil", exact: true })
    .click();
  await expect(
    page.getByLabel("Szerokość z wystającymi elementami"),
  ).toHaveValue("90");
});

test("good discovery is visible to visitors, maps to its location, and can be withdrawn only by its author", async ({
  page,
  browser,
}) => {
  const email = `good-${Date.now()}@example.test`,
    password = "Isolated-test-password-72";
  await page.request.post("/api/auth/register", {
    data: { email, password, displayName: "Próba dobrego odkrycia" },
  });
  const response = await page.request.post("/api/observations", {
    data: {
      type: "rest_place",
      coordinates: [19.9384, 50.067],
      description:
        "Test odizolowany: przy alejce stoi drewniana ławka z oparciem i miejscem na wózek obok.",
      observedNow: true,
    },
  });
  expect(response.status()).toBe(201);
  const observation = await response.json();
  const visitor = await browser.newContext({
    baseURL: "http://127.0.0.1:4174",
  });
  const other = await visitor.newPage();
  await start(other);
  await other
    .getByRole("button", {
      name: "Odkrycie: Miejsce odpoczynku. Pokaż opis",
    })
    .click();
  const card = other.locator(`[data-observation-id="${observation.id}"]`);
  await expect(card).toContainText("drewniana ławka");
  await expect(card).toBeFocused();
  await expect(card).toBeInViewport();
  await expect(
    card.getByRole("button", { name: "Wycofaj moje odkrycie" }),
  ).toHaveCount(0);
  await card.getByRole("button", { name: "Na mapie", exact: true }).click();
  await expect(
    other.getByRole("button", {
      name: "Odkrycie: Miejsce odpoczynku. Pokaż opis",
    }),
  ).toBeVisible();
  await card.getByRole("button", { name: "Zaplanuj dojście" }).click();
  await expect(
    other.getByRole("combobox", { name: "Dokąd", exact: true }),
  ).toHaveValue("Miejsce odpoczynku");
  await start(page);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Wspólnie", exact: true })
    .click();
  const mine = page.locator(`[data-observation-id="${observation.id}"]`);
  await mine.getByRole("button", { name: "Wycofaj moje odkrycie" }).click();
  await mine
    .getByRole("button", { name: "Wycofaj obserwację", exact: true })
    .click();
  await expect(mine).toHaveCount(0);
  await other.reload();
  await other
    .getByRole("navigation")
    .getByRole("button", { name: "Wspólnie", exact: true })
    .click();
  await expect(
    other.locator(`[data-observation-id="${observation.id}"]`),
  ).toHaveCount(0);
  await visitor.close();
});
