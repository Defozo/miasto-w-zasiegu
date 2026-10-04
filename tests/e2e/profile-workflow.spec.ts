import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const password = "Isolated-profile-workflow-2026!";
const whill = {
  id: "fixture-cached-whill-c2",
  name: "WHILL Model C2",
  manufacturer: "WHILL Inc.",
  status: "discovered",
  widthLabel: "55,4–65,0 cm, zależnie od konfiguracji siedziska",
  widthCm: null,
  sourceUrl: "https://whill.inc/us/model-c2/",
  manufacturerSourceUrl: "https://whill.inc/us/model-c2/",
  notes:
    "Kontrolowany wynik testowy: zakres szerokości całkowitej, bez jednej wartości dla wszystkich konfiguracji.",
  checkedAt: "2026-10-03T08:00:00Z",
};

async function localCatalog(page: Page) {
  const attemptedResearch: string[] = [];
  await page.route("**/api/wheelchairs/discoveries", (route) =>
    route.fulfill({ json: { wheelchairs: [whill] } }),
  );
  // No test is allowed to reach a research provider, even if Enter regresses.
  await page.route("**/api/wheelchairs/search", (route) => {
    attemptedResearch.push(route.request().postData() ?? "");
    return route.fulfill({
      status: 503,
      json: {
        error: {
          message: "Wyszukiwanie internetowe zablokowane w izolowanym teście.",
        },
      },
    });
  });
  return attemptedResearch;
}
async function tab(page: Page, name: string) {
  await page
    .getByRole("navigation")
    .getByRole("button", { name, exact: true })
    .click();
}
async function startProfile(page: Page) {
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "Dokąd ruszamy?", exact: true }),
  ).toBeVisible();
  await tab(page, "Twój profil");
}
async function refreshedOwner(page: Page, ownerId: string) {
  const response = page.waitForResponse((value) =>
    value.url().endsWith("/api/auth/me"),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  expect((await (await response).json()).user.id).toBe(ownerId);
}

test("model Enter never saves or researches, ranges preserve measurements and applying one width gives visible unsaved feedback", async ({
  page,
}) => {
  const attemptedResearch = await localCatalog(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await startProfile(page);
  const width = page.getByLabel("Szerokość z wystającymi elementami", {
    exact: false,
  });
  const model = page.getByRole("searchbox", {
    name: "Producent i model wózka",
    exact: true,
  });
  await width.fill("74");
  await model.fill("WHILL Model C2");
  await expect(
    page.getByRole("button", {
      name: "WHILL Model C2 WHILL Inc.",
      exact: true,
    }),
  ).toBeVisible();
  await model.press("Enter");
  await expect(
    page.getByRole("heading", { name: "WHILL Model C2", exact: true }),
  ).toBeVisible();
  await expect(width).toHaveValue("74");
  await expect(page.locator(".model-result")).toContainText("55,4–65,0 cm");
  await expect(page.locator(".model-result")).toContainText(
    "Zachowujemy Twój pomiar: 74 cm",
  );
  await expect(
    page.getByRole("button", { name: /^Użyj szerokości/ }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("przejscie-profile")),
  ).toBeNull();
  await expect(page.locator(".profile-draft-status")).toContainText(
    "Masz niezapisane zmiany",
  );
  await model.fill("Nieznany model testowy");
  await model.press("Enter");
  await expect(page.locator(".model-keyboard-note")).toContainText(
    "Nie ma takiego modelu w zapisanym katalogu",
  );
  expect(attemptedResearch).toEqual([]);
  expect(
    await page.evaluate(() => localStorage.getItem("przejscie-profile")),
  ).toBeNull();

  await model.fill("Q50");
  const catalog = page.getByRole("button", {
    name: "Quickie Q50 R Sunrise Medical",
    exact: true,
  });
  await catalog.focus();
  await page.keyboard.press("Enter");
  const confirmation = page.getByRole("checkbox", {
    name: /Sprawdziłem\/am, że wymiar dotyczy mojego wózka/,
  });
  await expect(
    page.getByRole("button", { name: "Użyj szerokości 60 cm", exact: true }),
  ).toBeDisabled();
  await confirmation.focus();
  await page.keyboard.press("Space");
  const apply = page.getByRole("button", {
    name: "Użyj szerokości 60 cm",
    exact: true,
  });
  await apply.focus();
  await page.keyboard.press("Enter");
  await expect(width).toHaveValue("60");
  const applied = page.getByRole("button", {
    name: "Szerokość 60 cm jest w formularzu",
    exact: true,
  });
  await expect(applied).toBeDisabled();
  await expect(page.locator(".model-apply-note")).toContainText(
    "To jeszcze nie zapis preferencji",
  );
  await expect(page.locator(".model-apply-note")).toBeInViewport();
  expect(
    await page.evaluate(() => localStorage.getItem("przejscie-profile")),
  ).toBeNull();
  await tab(page, "Twoja trasa");
  await tab(page, "Twój profil");
  await expect(width).toHaveValue("60");
  await expect(page.locator(".profile-draft-status")).toContainText(
    "Masz niezapisane zmiany",
  );
  await page
    .getByRole("button", { name: "Zapisz preferencje", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("przejscie-profile")!).widthCm,
    ),
  ).toBe("60");
  await width.fill("78");
  await tab(page, "Twoja trasa");
  await tab(page, "Twój profil");
  await expect(width).toHaveValue("78");
  await expect(page.locator(".profile-draft-status")).toContainText(
    "Masz niezapisane zmiany",
  );
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("przejscie-profile")!).widthCm,
    ),
  ).toBe("60");
  await model.fill("Lexis");
  await model.press("Enter");
  await expect(page.locator(".model-result")).toContainText(
    "Sprzeczne dane o szerokości",
  );
  await expect(page.locator(".model-result")).toContainText(
    "Nie używamy go do uzupełnienia profilu",
  );
  await expect(
    page.getByRole("button", { name: /^Użyj szerokości/ }),
  ).toHaveCount(0);
  await expect(width).toHaveValue("78");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(attemptedResearch).toEqual([]);
});

test("draft measurements stay across tabs but never transfer from a guest or a previous account", async ({
  page,
}) => {
  const attemptedResearch = await localCatalog(page);
  await startProfile(page);
  const width = page.getByLabel("Szerokość z wystającymi elementami", {
    exact: false,
  });
  await width.fill("66");
  const emailA = `draft-a-${Date.now()}@example.invalid`;
  const createdA = await page.request.post("/api/auth/register", {
    data: { email: emailA, password, displayName: "Szkic konto A" },
  });
  expect(createdA.status()).toBe(201);
  const ownerA = (await createdA.json()).user.id;
  await refreshedOwner(page, ownerA);
  await expect(width).toHaveValue("");
  await width.fill("77");
  await tab(page, "Twoja trasa");
  await tab(page, "Twój profil");
  await expect(width).toHaveValue("77");
  await tab(page, "Twoja trasa");
  const createdB = await page.request.post("/api/auth/register", {
    data: {
      email: `draft-b-${Date.now()}@example.invalid`,
      password,
      displayName: "Szkic konto B",
    },
  });
  expect(createdB.status()).toBe(201);
  await refreshedOwner(page, (await createdB.json()).user.id);
  await tab(page, "Twój profil");
  await expect(width).toHaveValue("");
  const loginA = await page.request.post("/api/auth/login", {
    data: { email: emailA, password },
  });
  expect(loginA.status()).toBe(200);
  await refreshedOwner(page, ownerA);
  await expect(width).toHaveValue("");
  expect(
    (await (await page.request.get("/api/auth/me")).json()).profile,
  ).toBeNull();
  expect(attemptedResearch).toEqual([]);
});

test("failed account saves keep the previous active needs and the draft, and controls are disabled during save", async ({
  page,
}) => {
  await localCatalog(page);
  const created = await page.request.post("/api/auth/register", {
    data: {
      email: `draft-save-${Date.now()}@example.invalid`,
      password,
      displayName: "Test zapisu potrzeb",
    },
  });
  expect(created.status()).toBe(201);
  await startProfile(page);
  const width = page.getByLabel("Szerokość z wystającymi elementami", {
    exact: false,
  });
  await width.fill("70");
  await page
    .getByRole("button", { name: "Zapisz preferencje", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Zapisano preferencje", exact: true }),
  ).toBeVisible();
  expect(
    (await (await page.request.get("/api/auth/me")).json()).profile.widthCm,
  ).toBe("70");
  await width.fill("80");
  let release!: () => void, arrived!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  await page.route(
    "**/api/profile",
    async (route) => {
      if (route.request().method() !== "PUT") return route.continue();
      arrived();
      await gate;
      await route.fulfill({
        status: 503,
        json: {
          error: {
            message: "Izolowany test: zapis jest chwilowo niedostępny.",
          },
        },
      });
    },
    { times: 1 },
  );
  await page
    .getByRole("button", { name: "Zapisz preferencje", exact: true })
    .click();
  await pending;
  try {
    await expect(width).toBeDisabled();
    await expect(
      page.getByRole("searchbox", {
        name: "Producent i model wózka",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      page.getByLabel("Maks. podjazd", { exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("radio", { name: "Wózek elektryczny", exact: true }),
    ).toBeDisabled();
    await expect(page.locator(".profile-draft-status")).toContainText(
      "Zapisujemy preferencje",
    );
  } finally {
    release();
  }
  await expect(page.getByRole("alert")).toContainText(
    "zapis jest chwilowo niedostępny",
  );
  await expect(width).toHaveValue("80");
  await expect(width).toBeEnabled();
  await expect(page.locator(".profile-draft-status")).toContainText(
    "Masz niezapisane zmiany",
  );
  expect(
    (await (await page.request.get("/api/auth/me")).json()).profile.widthCm,
  ).toBe("70");
  await tab(page, "Twoja trasa");
  await tab(page, "Twój profil");
  await expect(width).toHaveValue("80");
  await expect(page.locator(".profile-draft-status")).toContainText(
    "Masz niezapisane zmiany",
  );
  await page
    .getByRole("button", { name: "Zapisz preferencje", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Zapisano preferencje", exact: true }),
  ).toBeVisible();
  expect(
    (await (await page.request.get("/api/auth/me")).json()).profile.widthCm,
  ).toBe("80");
});

test("a delayed successful save does not erase a newer draft entered after returning to the profile", async ({
  page,
}) => {
  await localCatalog(page);
  const registration = await page.request.post("/api/auth/register", {
    data: {
      email: `draft-late-${Date.now()}@example.invalid`,
      password,
      displayName: "Test późnego zapisu",
    },
  });
  expect(registration.status()).toBe(201);
  await startProfile(page);
  const width = page.getByLabel("Szerokość z wystającymi elementami", {
    exact: false,
  });
  await width.fill("80");
  let release!: () => void, arrived!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  await page.route(
    "**/api/profile",
    async (route) => {
      if (route.request().method() !== "PUT") return route.continue();
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      arrived();
      await gate;
      await route.fulfill({ response });
    },
    { times: 1 },
  );
  await page
    .getByRole("button", { name: "Zapisz preferencje", exact: true })
    .click();
  await pending;
  try {
    await expect(width).toBeDisabled();
    await tab(page, "Twoja trasa");
    await tab(page, "Twój profil");
    await expect(width).toHaveValue("80");
    await expect(width).toBeEnabled();
    await width.fill("85");
    const completed = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/profile") &&
        response.request().method() === "PUT",
    );
    release();
    await completed;
    // The header proves the old request has committed, so observing draft 85 is
    // not an assertion made too early, before the delayed handler runs.
    await expect(
      page.getByRole("button", {
        name: "Szerokość 80 cm. Twoje preferencje",
        exact: true,
      }),
    ).toBeVisible();
    await expect(width).toHaveValue("85");
    await expect(page.locator(".profile-draft-status")).toContainText(
      "Masz niezapisane zmiany",
    );
    expect(
      (await (await page.request.get("/api/auth/me")).json()).profile.widthCm,
    ).toBe("80");
    await page
      .getByRole("button", { name: "Zapisz preferencje", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Zapisano preferencje", exact: true }),
    ).toBeVisible();
    expect(
      (await (await page.request.get("/api/auth/me")).json()).profile.widthCm,
    ).toBe("85");
  } finally {
    release();
  }
});

test("a failed local write keeps guest measurements unsaved and retrying after recovery persists them", async ({
  page,
}) => {
  await localCatalog(page);
  await startProfile(page);
  const width = page.getByLabel("Szerokość z wystającymi elementami", {
    exact: false,
  });
  await width.fill("72");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "przejscie-profile")
        throw new DOMException(
          "Isolated local-storage failure",
          "QuotaExceededError",
        );
      return original.call(this, key, value);
    };
    (
      window as unknown as { __restoreProfileStorage: () => void }
    ).__restoreProfileStorage = () => {
      Storage.prototype.setItem = original;
    };
  });
  await page
    .getByRole("button", { name: "Zapisz preferencje", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Przeglądarka nie pozwoliła zapisać potrzeb",
  );
  await expect(width).toHaveValue("72");
  await expect(page.locator(".profile-draft-status")).toContainText(
    "Masz niezapisane zmiany",
  );
  await expect(
    page.getByRole("button", { name: "Zapisano preferencje", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("przejscie-profile")),
  ).toBeNull();
  await tab(page, "Twoja trasa");
  await tab(page, "Twój profil");
  await expect(width).toHaveValue("72");
  await expect(page.locator(".profile-draft-status")).toContainText(
    "Masz niezapisane zmiany",
  );
  await page.evaluate(() =>
    (
      window as unknown as { __restoreProfileStorage: () => void }
    ).__restoreProfileStorage(),
  );
  await page
    .getByRole("button", { name: "Zapisz preferencje", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Zapisano preferencje", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("przejscie-profile")!).widthCm,
    ),
  ).toBe("72");
  await page.reload();
  await tab(page, "Twój profil");
  await expect(width).toHaveValue("72");
  await expect(page.locator(".profile-draft-status")).not.toContainText(
    "Masz niezapisane zmiany",
  );
});

test("an older session profile cannot undo a newer save, but a different owner with a lower version still replaces it", async ({
  page,
}) => {
  await localCatalog(page);
  const registration = await page.request.post("/api/auth/register", {
    data: {
      email: `profile-read-race-${Date.now()}@example.invalid`,
      password,
      displayName: "Test wersji profilu A",
    },
  });
  expect(registration.status()).toBe(201);
  const ownerA = (await registration.json()).user.id;
  await startProfile(page);
  const width = page.getByLabel("Szerokość z wystającymi elementami", {
    exact: false,
  });
  const save = page.getByRole("button", {
    name: "Zapisz preferencje",
    exact: true,
  });
  await width.fill("70");
  await save.click();
  await expect(
    page.getByRole("button", {
      name: "Szerokość 70 cm. Twoje preferencje",
      exact: true,
    }),
  ).toBeVisible();
  const first = await (await page.request.get("/api/auth/me")).json();
  expect(first.user.id).toBe(ownerA);
  expect(first.profileVersion).toBe(1);

  // Tag only the deliberate refresh. A browser focus event cannot consume the
  // held response or start an extra read that accidentally hides the race.
  await page.evaluate(() => {
    const scope = window as unknown as {
      __profileRaceRead?: boolean;
      __profileRaceTrigger?: boolean;
      __cleanupProfileRace?: () => void;
    };
    const originalFetch = window.fetch;
    const blockIncidental = (event: Event) => {
      if (!scope.__profileRaceTrigger) event.stopImmediatePropagation();
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
        scope.__profileRaceRead
      ) {
        const headers = new Headers(init?.headers);
        headers.set("x-profile-race-read", "held-v1");
        delete scope.__profileRaceRead;
        return originalFetch.call(this, input, { ...init, headers });
      }
      return originalFetch.call(this, input, init);
    };
    scope.__cleanupProfileRace = () => {
      window.fetch = originalFetch;
      window.removeEventListener("focus", blockIncidental, true);
      document.removeEventListener("visibilitychange", blockIncidental, true);
      delete scope.__profileRaceRead;
      delete scope.__profileRaceTrigger;
    };
  });
  let release!: () => void, arrived!: () => void, finished!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  const complete = new Promise<void>((resolve) => {
    finished = resolve;
  });
  let held = false;
  const handler = async (route: import("@playwright/test").Route) => {
    if (route.request().headers()["x-profile-race-read"] !== "held-v1")
      return route.continue();
    expect(held).toBe(false);
    held = true;
    const response = await route.fetch();
    const captured = await response.json();
    expect(captured.user.id).toBe(ownerA);
    expect(captured.profileVersion).toBe(1);
    expect(captured.profile.widthCm).toBe("70");
    arrived();
    await gate;
    try {
      await route.fulfill({ response });
    } finally {
      finished();
    }
  };
  await page.route("**/api/auth/me", handler);
  try {
    await page.evaluate(() => {
      const scope = window as unknown as {
        __profileRaceRead: boolean;
        __profileRaceTrigger: boolean;
      };
      scope.__profileRaceRead = true;
      scope.__profileRaceTrigger = true;
      window.dispatchEvent(new Event("focus"));
      scope.__profileRaceTrigger = false;
    });
    await pending;
    await width.fill("80");
    await save.click();
    await expect(
      page.getByRole("button", {
        name: "Szerokość 80 cm. Twoje preferencje",
        exact: true,
      }),
    ).toBeVisible();
    const second = await (await page.request.get("/api/auth/me")).json();
    expect(second.profileVersion).toBe(2);
    expect(second.profile.widthCm).toBe("80");

    const staleResponse = page.waitForResponse(
      (response) =>
        response.request().headers()["x-profile-race-read"] === "held-v1",
    );
    release();
    await staleResponse;
    await complete;
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(width).toHaveValue("80");
    await expect(
      page.getByRole("button", {
        name: "Szerokość 80 cm. Twoje preferencje",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator(".profile-draft-status")).not.toContainText(
      "Masz niezapisane zmiany",
    );
  } finally {
    release();
    if (held) await complete;
    await page.unroute("**/api/auth/me", handler);
    await page.evaluate(() =>
      (
        window as unknown as { __cleanupProfileRace: () => void }
      ).__cleanupProfileRace(),
    );
  }

  // Monotonicity applies only within one account. A newly logged-in account at
  // version zero must replace A and clear A's active measurements and drafts.
  await width.fill("85");
  const other = await page.request.post("/api/auth/register", {
    data: {
      email: `profile-read-race-b-${Date.now()}@example.invalid`,
      password,
      displayName: "Test wersji profilu B",
    },
  });
  expect(other.status()).toBe(201);
  const stateB = await other.json();
  expect(stateB.profileVersion).toBe(0);
  await refreshedOwner(page, stateB.user.id);
  await expect(width).toHaveValue("");
  await expect(
    page.getByRole("button", {
      name: "Szerokość 80 cm. Twoje preferencje",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(page.locator(".profile-draft-status")).not.toContainText(
    "Masz niezapisane zmiany",
  );
});
