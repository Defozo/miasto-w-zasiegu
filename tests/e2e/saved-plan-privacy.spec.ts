import { test, expect, request, type Page } from "@playwright/test";

const STORAGE = "przejscie-saved-route";
const password = "Isolated-plan-privacy-password-2026!";
type Account = { id: string; email: string };
type Saved = {
  scope: "account" | "device";
  ownerId: string | null;
  startLabel: string;
  place: { name: string };
  route: { geometry: { type: "LineString"; coordinates: number[][] } };
};
let accounts: { a: Account; b: Account };

// Reuse only server-side identities. Each test still has its own isolated browser
// context and localStorage. Two registrations keep the full suite below auth limits.
test.beforeAll(async ({}, info) => {
  const api = await request.newContext({ baseURL: info.project.use.baseURL });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    const values: Account[] = [];
    for (const letter of ["a", "b"]) {
      const email = `plan-privacy-${letter}-${suffix}@example.invalid`;
      const response = await api.post("/api/auth/register", {
        data: {
          email,
          password,
          displayName: `Test prywatności ${letter.toUpperCase()}`,
        },
      });
      expect(response.status()).toBe(201);
      values.push({ id: (await response.json()).user.id, email });
    }
    accounts = { a: values[0], b: values[1] };
  } finally {
    await api.dispose();
  }
});

async function login(page: Page, account: Account) {
  const response = await page.request.post("/api/auth/login", {
    data: { email: account.email, password },
  });
  expect(response.status()).toBe(200);
  expect((await response.json()).user.id).toBe(account.id);
}

async function address(page: Page, label: string, query: string) {
  await page.getByRole("combobox", { name: label, exact: true }).fill(query);
  await page
    .getByRole("listbox", { name: `Podpowiedzi: ${label}` })
    .getByRole("option")
    .first()
    .click();
}

async function createPlan(page: Page, device = false): Promise<Saved> {
  const me = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/auth/me") &&
      response.request().method() === "GET",
  );
  await page.goto("/app");
  expect((await (await me).json()).user.id).toBe(accounts.a.id);
  await page.getByRole("button", { name: "Na razie pomiń" }).click();
  await address(page, "Skąd", "Długa 12");
  await address(page, "Dokąd", "Rynek Główny 1");
  const calculated = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/route") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Wyznacz trasę", exact: true })
    .click();
  expect((await calculated).ok()).toBe(true);
  await expect(
    page.getByRole("heading", { name: "Przebieg trasy" }),
  ).toBeVisible();
  const deviceAccess = page.getByRole("checkbox", {
    name: /Dostęp bez logowania na tym urządzeniu/,
  });
  await expect(deviceAccess).not.toBeChecked();
  if (device) {
    await deviceAccess.check();
    await expect(
      page.getByText(/Inne osoby korzystające z tego urządzenia/),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "Zapisz plan", exact: true }).click();
  const saved = (await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    STORAGE,
  )) as Saved;
  expect(saved.scope).toBe(device ? "device" : "account");
  expect(saved.ownerId).toBe(device ? null : accounts.a.id);
  expect(saved.route.geometry.type).toBe("LineString");
  expect(saved.route.geometry.coordinates.length).toBeGreaterThan(1);
  return saved;
}

async function watchForLeaks(page: Page, saved: Saved) {
  await page.addInitScript(
    ({ labels, coordinates }) => {
      const state = {
        domLeaks: [] as string[],
        geometrySeen: false,
        workerMessages: 0,
      };
      (window as unknown as { __planPrivacy: typeof state }).__planPrivacy =
        state;
      function note(value: string) {
        if (!state.domLeaks.includes(value)) state.domLeaks.push(value);
      }
      const scan = () => {
        if (document.querySelector(".saved-plan-destination"))
          note("saved-destination");
        if (document.querySelector(".route-result")) note("route-result");
        if (
          [...document.querySelectorAll("button")].some(
            (button) => button.textContent?.trim() === "Otwórz zapisaną trasę",
          )
        )
          note("open-button");
        if (
          [...document.querySelectorAll("input")].some((input) =>
            labels.some((label) => input.value === label),
          )
        )
          note("private-address-input");
        if (
          document.querySelector(
            '[role="img"][aria-label="Początek trasy"], [role="img"][aria-label^="Cel trasy:"]',
          )
        )
          note("route-marker");
      };
      new MutationObserver(scan).observe(document, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
      });
      document.addEventListener("DOMContentLoaded", scan);
      // GeoJSON only: ordinary map tiles and unrelated OSM point features do not
      // count. Capture the exact saved LineString, not arbitrary coordinate text.
      const expected = JSON.stringify(coordinates);
      const original = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (
        message: unknown,
        options?: Transferable[] | StructuredSerializeOptions,
      ) {
        state.workerMessages++;
        let inspected = 0;
        function containsRoute(value: unknown, depth = 0): boolean {
          if (depth > 12 || ++inspected > 150) return false;
          if (typeof value === "string" && value.startsWith("{")) {
            try {
              return containsRoute(JSON.parse(value), depth + 1);
            } catch {
              return false;
            }
          }
          if (
            !value ||
            typeof value !== "object" ||
            value instanceof ArrayBuffer ||
            ArrayBuffer.isView(value)
          )
            return false;
          const object = value as Record<string, unknown>;
          if (
            object.type === "LineString" &&
            JSON.stringify(object.coordinates) === expected
          )
            return true;
          return Object.values(object).some((child) =>
            containsRoute(child, depth + 1),
          );
        }
        if (containsRoute(message)) state.geometrySeen = true;
        return original.call(
          this,
          message,
          options as StructuredSerializeOptions,
        );
      };
    },
    {
      labels: [saved.startLabel, saved.place.name],
      coordinates: saved.route.geometry.coordinates,
    },
  );
}

async function noPrivatePlan(page: Page, saved: Saved) {
  await expect(
    page.getByRole("button", { name: "Otwórz zapisaną trasę", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".saved-plan-destination")).toHaveCount(0);
  await expect(page.locator(".route-result")).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Skąd", exact: true }),
  ).not.toHaveValue(saved.startLabel);
  await expect(
    page.getByRole("combobox", { name: "Dokąd", exact: true }),
  ).not.toHaveValue(saved.place.name);
  await expect(
    page.getByRole("img", { name: "Początek trasy", exact: true }),
  ).toHaveCount(0);
  const observed = await page.evaluate(
    () =>
      (
        window as unknown as {
          __planPrivacy: { domLeaks: string[]; geometrySeen: boolean };
        }
      ).__planPrivacy,
  );
  expect(observed.domLeaks).toEqual([]);
  expect(observed.geometrySeen).toBe(false);
}

test("an account plan never flashes for account B or a guest, including while auth is delayed", async ({
  page,
}) => {
  await login(page, accounts.a);
  const saved = await createPlan(page);
  await watchForLeaks(page, saved);
  await login(page, accounts.b);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let intercepted!: () => void;
  const started = new Promise<void>((resolve) => {
    intercepted = resolve;
  });
  await page.route(
    "**/api/auth/me",
    async (route) => {
      const response = await route.fetch();
      expect((await response.json()).user.id).toBe(accounts.b.id);
      intercepted();
      await held;
      await route.fulfill({ response });
    },
    { times: 1 },
  );
  const me = page.waitForResponse((response) =>
    response.url().endsWith("/api/auth/me"),
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await started;
  try {
    await expect(
      page.getByRole("heading", {
        name: "Plan przypisany do konta",
        exact: true,
      }),
    ).toBeVisible();
    await noPrivatePlan(page, saved);
  } finally {
    release();
  }
  expect((await (await me).json()).user.id).toBe(accounts.b.id);
  await expect(page.locator(".map-section")).toHaveAttribute(
    "data-map-ready",
    "true",
    { timeout: 20000 },
  );
  await noPrivatePlan(page, saved);
  const ended = await page.request.post("/api/auth/logout");
  expect(ended.ok()).toBe(true);
  expect(
    (await (await page.request.get("/api/auth/me")).json()).user,
  ).toBeNull();
  const guest = page.waitForResponse((response) =>
    response.url().endsWith("/api/auth/me"),
  );
  await page.reload();
  expect((await (await guest).json()).user).toBeNull();
  await noPrivatePlan(page, saved);
});

test("a private account plan cannot be opened on a fresh offline reload even with the owner cookie", async ({
  page,
  context,
}) => {
  await login(page, accounts.a);
  const saved = await createPlan(page);
  await watchForLeaks(page, saved);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByText("Jesteś offline.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Plan przypisany do konta",
      exact: true,
    }),
  ).toBeVisible();
  await noPrivatePlan(page, saved);
});

test("an explicitly device-scoped plan survives logout and opens for an offline guest", async ({
  page,
  context,
}) => {
  await login(page, accounts.a);
  const saved = await createPlan(page, true);
  expect((await page.request.post("/api/auth/logout")).ok()).toBe(true);
  expect(
    (await (await page.request.get("/api/auth/me")).json()).user,
  ).toBeNull();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByText("Jesteś offline.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Otwórz zapisaną trasę", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Przebieg trasy", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Skąd", exact: true }),
  ).toHaveValue(saved.startLabel);
  await expect(
    page.getByRole("combobox", { name: "Dokąd", exact: true }),
  ).toHaveValue(saved.place.name);
  await expect(
    page.getByRole("button", { name: "Przelicz trasę", exact: true }),
  ).toBeDisabled();
  const remaining = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    STORAGE,
  );
  expect(remaining.scope).toBe("device");
  expect(remaining.ownerId).toBeNull();
  expect(remaining.route.geometry).toEqual(saved.route.geometry);
});

test("a legacy plan without ownership metadata stays hidden and asks for recalculation", async ({
  page,
}) => {
  await login(page, accounts.a);
  const saved = await createPlan(page);
  await page.evaluate((key) => {
    const legacy = JSON.parse(localStorage.getItem(key)!);
    delete legacy.scope;
    delete legacy.ownerId;
    localStorage.setItem(key, JSON.stringify(legacy));
  }, STORAGE);
  await watchForLeaks(page, saved);
  const me = page.waitForResponse((response) =>
    response.url().endsWith("/api/auth/me"),
  );
  await page.reload();
  expect((await (await me).json()).user.id).toBe(accounts.a.id);
  await expect(
    page.getByRole("heading", { name: "Starszy format zapisu", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Ten zapis nie określa właściciela. Ze względu na prywatność wyznacz i zapisz trasę ponownie.",
      { exact: true },
    ),
  ).toBeVisible();
  await noPrivatePlan(page, saved);
});

test("the last started session read wins in both response orders without exposing an older owner", async ({
  page,
}) => {
  await login(page, accounts.a);
  const stateA = await (await page.request.get("/api/auth/me")).json();
  const saved = await createPlan(page);
  await login(page, accounts.b);
  const stateB = await (await page.request.get("/api/auth/me")).json();
  expect((await page.request.post("/api/auth/logout")).ok()).toBe(true);
  await watchForLeaks(page, saved);

  for (const order of [
    [0, 1],
    [1, 0],
  ]) {
    const initial = page.waitForResponse((response) =>
      response.url().endsWith("/api/auth/me"),
    );
    await page.reload();
    expect((await (await initial).json()).user).toBeNull();
    await noPrivatePlan(page, saved);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    // Mark only the two deliberate refreshes. Native focus/visibility changes
    // cannot consume a gate or create a third read that masks the race.
    await page.evaluate(() => {
      const scope = window as unknown as {
        __raceRead?: string;
        __raceTrigger?: boolean;
        __cleanupRace?: () => void;
      };
      const originalFetch = window.fetch;
      const blockIncidental = (event: Event) => {
        if (!scope.__raceTrigger) event.stopImmediatePropagation();
      };
      window.addEventListener("focus", blockIncidental, true);
      document.addEventListener("visibilitychange", blockIncidental, true);
      window.fetch = function (input, init) {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        if (
          new URL(url, location.href).pathname === "/api/auth/me" &&
          scope.__raceRead !== undefined
        ) {
          const headers = new Headers(init?.headers);
          headers.set("x-plan-race-read", scope.__raceRead);
          delete scope.__raceRead;
          return originalFetch.call(this, input, { ...init, headers });
        }
        return originalFetch.call(this, input, init);
      };
      scope.__cleanupRace = () => {
        window.fetch = originalFetch;
        window.removeEventListener("focus", blockIncidental, true);
        document.removeEventListener("visibilitychange", blockIncidental, true);
        delete scope.__raceRead;
        delete scope.__raceTrigger;
      };
    });
    const releases: (() => void)[] = [],
      arrivals: (() => void)[] = [],
      finishes: (() => void)[] = [];
    const gates = [0, 1].map(
      (index) =>
        new Promise<void>((resolve) => {
          releases[index] = resolve;
        }),
    );
    const seen = [0, 1].map(
      (index) =>
        new Promise<void>((resolve) => {
          arrivals[index] = resolve;
        }),
    );
    const finished = [0, 1].map(
      (index) =>
        new Promise<void>((resolve) => {
          finishes[index] = resolve;
        }),
    );
    const claimed = new Set<string>();
    let unexpected = 0;
    const handler = async (route: import("@playwright/test").Route) => {
      const tag = route.request().headers()["x-plan-race-read"];
      if ((tag !== "0" && tag !== "1") || claimed.has(tag)) {
        unexpected++;
        await route.fulfill({ json: stateB });
        return;
      }
      claimed.add(tag);
      const index = Number(tag);
      arrivals[index]();
      await gates[index];
      try {
        await route.fulfill({ json: index === 0 ? stateA : stateB });
      } finally {
        finishes[index]();
      }
    };
    // Keep the same handler until both held requests finish. Never use times:2
    // with concurrent pending requests or remove a handler while it is active.
    await page.route("**/api/auth/me", handler);
    try {
      for (const index of [0, 1]) {
        await page.evaluate((value) => {
          const scope = window as unknown as {
            __raceRead?: string;
            __raceTrigger?: boolean;
          };
          scope.__raceRead = String(value);
          scope.__raceTrigger = true;
          try {
            window.dispatchEvent(new Event("focus"));
          } finally {
            scope.__raceTrigger = false;
          }
        }, index);
        await seen[index];
      }
      for (const index of order) {
        const completed = page.waitForResponse(
          (response) =>
            response.url().endsWith("/api/auth/me") &&
            response.request().headers()["x-plan-race-read"] === String(index),
        );
        releases[index]();
        expect((await (await completed).json()).user.id).toBe(
          index === 0 ? accounts.a.id : accounts.b.id,
        );
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve()),
              ),
            ),
        );
        await noPrivatePlan(page, saved);
      }
      expect(unexpected).toBe(0);
      await page
        .getByRole("navigation")
        .getByRole("button", { name: "Konto", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "Cześć, Test prywatności B.",
          exact: true,
        }),
      ).toBeVisible();
    } finally {
      releases.forEach((release) => release());
      await Promise.all(finished);
      await page.unroute("**/api/auth/me", handler);
      await page.evaluate(() =>
        (window as unknown as { __cleanupRace?: () => void }).__cleanupRace?.(),
      );
    }
  }
});
