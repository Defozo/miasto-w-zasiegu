import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }) => {
  // Allow local verification to reuse Vite while keeping API traffic in the memory fixture.
  const origin = process.env.ROUTE_RECOVERY_API_ORIGIN;
  if (origin) await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `${origin}${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });
});

async function chooseAddress(page: Page, label: string, query: string) {
  const input = page.getByRole("combobox", { name: label, exact: true });
  await input.fill(query);
  await expect(page.getByRole("listbox", { name: `Podpowiedzi: ${label}` }).getByRole("option").first()).toBeVisible();
  await input.press("ArrowDown");
  await input.press("Enter");
}

async function openJourney(page: Page) {
  await page.goto("/app");
  await page.getByRole("radio", { name: "Wózek manualny", exact: true }).check();
  await page.getByRole("checkbox", { name: "Korzystam też z samochodu" }).check();
  await page.getByRole("button", { name: "Dalej", exact: true }).click();
  await page.getByRole("button", { name: "Wpisz parametry", exact: true }).click();
  await page.getByLabel("Szerokość całkowita z wyposażeniem").fill("72");
  await page.getByText("Dostosuj warunki przejazdu", { exact: true }).click();
  await page.getByLabel("Maksymalny wygodny podjazd (%)", { exact: true }).fill("5");
  await page.getByLabel("Maksymalny krawężnik (cm)", { exact: true }).fill("1");
  await page.getByRole("checkbox", { name: "Unikaj nieutwardzonej nawierzchni" }).check();
  await page.getByRole("button", { name: "Zastosuj i pokaż mapę", exact: true }).click();
  await chooseAddress(page, "Miejsce lub adres", "Wawel");
  await page.getByRole("button", { name: "Nawiguj", exact: true }).click();
  const showList = page.getByRole("button", { name: "Pokaż listę", exact: true });
  if (await showList.isVisible()) await showList.click();
  await chooseAddress(page, "Skąd", "Długa 12");
  await chooseAddress(page, "Dokąd", "Rynek Główny 1");
  await page.getByRole("button", { name: "Auto + dalszy odcinek", exact: true }).click();
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`parking recovery keeps needs and supports keyboard actions at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const requests: Record<string, unknown>[] = [];
    // Simulate only the failure, against the isolated test API. No observations are written.
    await page.route("**/api/journeys", route => {
      requests.push(route.request().postDataJSON());
      return route.fulfill({ status: 422, json: { error: {
        code: "NO_JOURNEY",
        message: "Parkingi są na mapie. Sprawdzono: 8. Brak wyznaczonego dojazdu autem: 8.",
        details: { checkedParkings: 8, suggestion: "Wybierz inny parking albo opcję podróży bez auta. Zmiana potrzeb dotyczących poruszania się nie naprawi dojazdu samochodem." },
      } } });
    });
    await openJourney(page);
    const originalProfile = await page.evaluate(() => localStorage.getItem("przejscie-guest-presets-v1"));
    const start = page.getByRole("combobox", { name: "Skąd", exact: true });
    const end = page.getByRole("combobox", { name: "Dokąd", exact: true });
    const originalStart = await start.inputValue();
    const originalEnd = await end.inputValue();
    const plan = page.getByRole("button", { name: "Wyznacz trasę", exact: true });
    await plan.focus();
    await page.keyboard.press("Enter");
    const error = page.locator(".route-error");
    await expect(error).toContainText("Nie udało się zaplanować podróży przez parking");
    await expect(error).toContainText("Twoje ustawienia pozostają bez zmian.");
    await expect(error).toContainText("Sprawdzono: 8");
    await expect(error).toContainText("nie naprawi dojazdu samochodem");
    await expect(error).not.toContainText("Sprawdź adresy i swoje ustawienia");
    await expect(plan).toBeFocused();
    expect(requests).toHaveLength(1);
    expect(requests[0].profile).toEqual({ mobility: "manual", widthCm: 72, maxIncline: 5, maxKerbCm: 1, avoidUnpaved: true });
    const audit = await new AxeBuilder({ page }).include(".route-error").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(audit.violations).toEqual([]);
    await error.screenshot({ path: testInfo.outputPath("parking-recovery.png") });

    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Zmień cel", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(end).toBeFocused();
    await expect(end).toHaveValue(originalEnd);
    await expect(start).toHaveValue(originalStart);
    expect(await page.evaluate(() => localStorage.getItem("przejscie-guest-presets-v1"))).toBe(originalProfile);

    await chooseAddress(page, "Dokąd", "Floriańska 1");
    await expect(error).toHaveCount(0);
    await plan.click();
    await expect(error).toBeVisible();
    expect(requests).toHaveLength(2);
    expect(requests[1].end).not.toEqual(requests[0].end);
    expect({ ...requests[1], end: requests[0].end }).toEqual(requests[0]);
    await page.getByRole("button", { name: "Pokaż moje potrzeby", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Twój profil", exact: true })).toBeFocused();
    expect(await page.evaluate(() => localStorage.getItem("przejscie-guest-presets-v1"))).toBe(originalProfile);
  });
}

test("a service failure gives no address or profile advice and keyboard retry preserves the request", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/journeys", route => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ status: 503, json: { error: {
      code: "ROUTING_UNAVAILABLE",
      message: "Usługa wyznaczania tras jest chwilowo niedostępna. Spróbuj ponownie.",
    } } });
  });
  await openJourney(page);
  const plan = page.getByRole("button", { name: "Wyznacz trasę", exact: true });
  await plan.focus();
  await page.keyboard.press("Enter");
  const error = page.locator(".route-error");
  await expect(error).toHaveText("Usługa wyznaczania tras jest chwilowo niedostępna. Spróbuj ponownie.");
  await expect(error.getByRole("button")).toHaveCount(0);
  await expect(plan).toBeFocused();
  await expect(plan).toHaveAttribute("aria-disabled", "false");
  await page.keyboard.press("Enter");
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]).toEqual(requests[0]);
});
