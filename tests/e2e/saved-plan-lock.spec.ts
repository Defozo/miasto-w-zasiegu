import { test, expect, type Page } from "@playwright/test";

const STORAGE = "przejscie-saved-route";
type RoutePaint = { kind: "line" | "empty"; coordinates?: number[][] };
type Saved = {
  scope: "account" | "device";
  ownerId: string | null;
  startLabel: string;
  place: { name: string };
  route: { geometry: { coordinates: number[][] } };
};

async function painted(page: Page) {
  return page.evaluate(
    () =>
      (window as unknown as { __routePaint: RoutePaint | null }).__routePaint,
  );
}
async function opened(page: Page, saved: Saved) {
  await expect(
    page.getByRole("heading", { name: "Przebieg trasy", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Skąd", exact: true }),
  ).toHaveValue(saved.startLabel);
  await expect(
    page.getByRole("combobox", { name: "Dokąd", exact: true }),
  ).toHaveValue(saved.place.name);
  await expect
    .poll(() => painted(page))
    .toEqual({ kind: "line", coordinates: saved.route.geometry.coordinates });
}
async function locked(page: Page) {
  await expect(
    page.getByRole("heading", {
      name: "Plan przypisany do konta",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Otwórz zapisaną trasę", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator(".saved-plan-destination, .route-result"),
  ).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Skąd", exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByRole("combobox", { name: "Dokąd", exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByRole("img", { name: "Początek trasy", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("img", { name: /^Cel trasy:/ })).toHaveCount(0);
  await expect.poll(() => painted(page)).toEqual({ kind: "empty" });
}

test("an opened private plan locks on lost network or failed session refresh and device copies remain available", async ({
  page,
  context,
}) => {
  // Observe the actual route source sent to MapLibre. The positive assertion in
  // opened() proves the probe is connected before an empty-source assertion.
  await page.addInitScript(() => {
    (window as unknown as { __routePaint: RoutePaint | null }).__routePaint =
      null;
    const original = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (
      message: unknown,
      options?: Transferable[] | StructuredSerializeOptions,
    ) {
      const payload = (
        message as { data?: { source?: string; data?: unknown } } | null
      )?.data;
      if (payload?.source === "route") {
        let data = payload.data as Record<string, unknown> | undefined;
        if (typeof data === "string") {
          try {
            data = JSON.parse(data);
          } catch {
            data = undefined;
          }
        }
        if (
          data?.type === "FeatureCollection" &&
          Array.isArray(data.features) &&
          data.features.length === 0
        ) {
          (window as unknown as { __routePaint: RoutePaint }).__routePaint = {
            kind: "empty",
          };
        } else if (
          data?.type === "Feature" &&
          data.geometry &&
          typeof data.geometry === "object"
        ) {
          const geometry = data.geometry as {
            type?: string;
            coordinates?: number[][];
          };
          if (geometry.type === "LineString" && geometry.coordinates)
            (window as unknown as { __routePaint: RoutePaint }).__routePaint = {
              kind: "line",
              coordinates: geometry.coordinates,
            };
        }
      }
      return original.call(
        this,
        message,
        options as StructuredSerializeOptions,
      );
    };
  });
  const registration = await page.request.post("/api/auth/register", {
    data: {
      email: `plan-lock-${Date.now()}@example.invalid`,
      password: "Isolated-lock-test-password-2026!",
      displayName: "Test blokowania planu",
    },
  });
  expect(registration.status()).toBe(201);
  const owner = (await registration.json()).user.id;
  const firstSession = page.waitForResponse((response) =>
    response.url().endsWith("/api/auth/me"),
  );
  await page.goto("/app");
  expect((await (await firstSession).json()).user.id).toBe(owner);
  await page.getByRole("button", { name: "Na razie pomiń" }).click();
  for (const [label, query] of [
    ["Skąd", "Długa 12"],
    ["Dokąd", "Rynek Główny 1"],
  ]) {
    await page.getByRole("combobox", { name: label, exact: true }).fill(query);
    await page
      .getByRole("listbox", { name: `Podpowiedzi: ${label}` })
      .getByRole("option")
      .first()
      .click();
  }
  await page
    .getByRole("button", { name: "Wyznacz trasę", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Przebieg trasy", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Zapisz plan", exact: true }).click();
  const saved = (await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    STORAGE,
  )) as Saved;
  expect(saved.scope).toBe("account");
  expect(saved.ownerId).toBe(owner);
  const reloadedSession = page.waitForResponse((response) =>
    response.url().endsWith("/api/auth/me"),
  );
  await page.reload();
  expect((await (await reloadedSession).json()).user.id).toBe(owner);
  await page
    .getByRole("button", { name: "Otwórz zapisaną trasę", exact: true })
    .click();
  await expect(page.locator(".map-section")).toHaveAttribute(
    "data-map-ready",
    "true",
    { timeout: 20000 },
  );
  await opened(page, saved);

  await context.setOffline(true);
  await expect(
    page.getByText("Jesteś offline.", { exact: false }),
  ).toBeVisible();
  await locked(page);
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!),
      STORAGE,
    ),
  ).toEqual(saved);

  const backOnline = page.waitForResponse((response) =>
    response.url().endsWith("/api/auth/me"),
  );
  await context.setOffline(false);
  expect((await (await backOnline).json()).user.id).toBe(owner);
  // Verification unlocks the saved card but must not reopen private addresses.
  await expect(page.locator(".route-result")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Otwórz zapisaną trasę", exact: true })
    .click();
  await opened(page, saved);

  await page.route(
    "**/api/auth/me",
    (route) =>
      route.fulfill({
        status: 503,
        json: { error: { message: "Izolowany test niedostępności sesji" } },
      }),
    { times: 1 },
  );
  const unavailable = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/auth/me") && response.status() === 503,
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await unavailable;
  await locked(page);
  const verifiedAgain = page.waitForResponse(
    (response) => response.url().endsWith("/api/auth/me") && response.ok(),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  expect((await (await verifiedAgain).json()).user.id).toBe(owner);
  await page
    .getByRole("button", { name: "Otwórz zapisaną trasę", exact: true })
    .click();
  await opened(page, saved);

  await page
    .getByRole("checkbox", { name: /Dostęp bez logowania na tym urządzeniu/ })
    .check();
  await page.getByRole("button", { name: "Zapisz plan", exact: true }).click();
  const device = (await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    STORAGE,
  )) as Saved;
  expect(device.scope).toBe("device");
  expect(device.ownerId).toBeNull();
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByText("Jesteś offline.", { exact: false }),
  ).toBeVisible();
  await opened(page, device);
  await expect(
    page.getByRole("heading", {
      name: "Plan przypisany do konta",
      exact: true,
    }),
  ).toHaveCount(0);
});
