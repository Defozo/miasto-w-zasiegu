import { test, expect, type Page } from "@playwright/test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import AxeBuilder from "@axe-core/playwright";
import {
  PASSPORT_FIELD_DEFINITIONS,
  emptyPassportContent,
  type PassportDraft,
  type PassportFact,
  type PassportFieldKey,
  type PlacePassport,
} from "../../shared/place-passports.mjs";

const testPassword = "Isolated-passport-tests-2026!";

function publicFixture(): PlacePassport {
  const fields = Object.fromEntries(
    PASSPORT_FIELD_DEFINITIONS.map(({ key }) => [
      key,
      { value: null, status: "unknown", evidence: [] },
    ]),
  ) as Record<PassportFieldKey, PassportFact>;
  const evidence = (id: string, value: number, displayName: string) => ({
    id,
    value,
    source: { kind: "user" as const, label: "Pomiar testowy", url: null },
    author: { displayName },
    observedAt: "2025-01-01",
    publishedAt: "2025-01-02T12:00:00Z",
    recordUpdatedAt: null,
    siteVerification: null,
  });
  fields.widthCm = {
    value: null,
    status: "conflict",
    evidence: [
      evidence("first", 78, "Pierwszy autor"),
      evidence("second", 92, "Drugi autor"),
    ],
  };
  return {
    placeId: "test-widget",
    revision: 3,
    publishedAt: "2025-01-02T12:00:00Z",
    place: {
      id: "test-widget",
      name: "TEST: Obiekt do sprawdzenia widgetu",
      category: "culture",
      address: "Dane wyłącznie testowe",
      coordinates: [19.938, 50.061],
      website: null,
    },
    fields,
    entrances: [
      {
        id: "courtyard",
        label: "Wejście od dziedzińca",
        coordinates: [19.9381, 50.0611],
        fields,
      },
      {
        id: "unknown-point",
        label: "Wejście bez położenia",
        coordinates: null,
        fields,
      },
    ],
    metadataEvidence: {},
    sourcePlace: null,
  };
}

async function startObjects(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem("przejscie-onboarding", JSON.stringify("skipped")),
  );
  await page.goto("/app?objects=");
  await expect(
    page.getByRole("heading", { name: "Obiekty", exact: true }),
  ).toBeVisible();
}

test("the public widget works without account requests, cookies or storage", async ({
  page,
  context,
}) => {
  const forbiddenApi: string[] = [];
  const errors: string[] = [];
  const fixture = publicFixture();
  fixture.sourcePlace = {
    sourceLabel: "TEST: nieodświeżone źródło",
    provenance: {
      stale: true,
      syncStatus: "error",
      fetchedAt: "2025-01-03T12:00:00Z",
      importedAt: "2025-01-03T12:01:00Z",
      recordUpdatedAt: "2025-01-01T12:00:00Z",
    },
  };
  await context.addCookies([
    {
      name: "test-account-cookie",
      value: "must-not-be-sent",
      url: "http://127.0.0.1:4174/api",
    },
  ]);
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("Widget must not read local storage");
      },
    });
    Object.defineProperty(window, "sessionStorage", {
      get() {
        throw new Error("Widget must not read session storage");
      },
    });
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", async (route) => {
    if (
      new URL(route.request().url()).pathname ===
      "/api/place-passports/test-widget"
    ) {
      expect((await route.request().allHeaders()).cookie).toBeUndefined();
      await route.fulfill({ json: fixture });
    } else {
      forbiddenApi.push(route.request().url());
      await route.fulfill({
        status: 500,
        json: { error: { message: "Unexpected account request" } },
      });
    }
  });
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/embed/places/test-widget");
  await expect(
    page.getByRole("heading", { name: fixture.place.name, exact: true }),
  ).toBeVisible();
  await expect(page.locator(".passport-warning")).toContainText(
    "Źródło nie zostało poprawnie odświeżone",
  );
  await page
    .getByText("Pochodzenie danych źródłowych", { exact: true })
    .click();
  await expect(page.locator(".passport-source-context")).toContainText(
    "Pobrano ze źródła",
  );
  await expect(page.locator(".passport-source-context")).toContainText(
    "3 stycznia 2025",
  );
  await expect(page.locator(".passport-fact-conflict").first()).toContainText(
    "78 cm / 92 cm",
  );
  await expect(page.locator(".passport-fact-unknown").first()).toContainText(
    "Brak danych",
  );
  await page.getByText("Wejście od dziedzińca", { exact: true }).click();
  await expect(
    page.getByRole("link", { name: /Zaplanuj dojście do tego wejścia/ }),
  ).toHaveAttribute("href", "/app?place=test-widget&entrance=courtyard");
  await page.getByText("Wejście bez położenia", { exact: true }).click();
  await expect(
    page
      .locator(".passport-entrance")
      .filter({ hasText: "Wejście bez położenia" })
      .getByRole("link", { name: /Zaplanuj/ }),
  ).toHaveCount(0);
  const size = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: window.innerWidth,
  }));
  expect(size.scroll).toBeLessThanOrEqual(size.width);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe(
    "BODY",
  );
  expect(forbiddenApi).toEqual([]);
  expect(errors).toEqual([]);
});

test("widget refreshes within a minute and preserves the last version with a visible failure", async ({
  page,
}) => {
  await page.clock.install();
  let revision = 1;
  let fail = false;
  await page.route("**/api/place-passports/test-widget", (route) =>
    fail
      ? route.fulfill({
          status: 503,
          json: { error: { message: "Źródło jest chwilowo niedostępne." } },
        })
      : route.fulfill({ json: { ...publicFixture(), revision } }),
  );
  await page.goto("/embed/places/test-widget");
  await expect(page.locator(".passport-card")).toHaveAttribute(
    "data-passport-revision",
    "1",
  );
  revision = 2;
  await page.clock.fastForward(60001);
  await expect(page.locator(".passport-card")).toHaveAttribute(
    "data-passport-revision",
    "2",
  );
  fail = true;
  await page.clock.fastForward(60001);
  await expect(page.getByRole("status")).toContainText("mogą być nieaktualne");
  await expect(page.locator(".passport-card")).toHaveAttribute(
    "data-passport-revision",
    "2",
  );
  fail = false;
  revision = 3;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.locator(".passport-card")).toHaveAttribute(
    "data-passport-revision",
    "3",
  );
  await expect(page.locator(".passport-warning")).toHaveCount(0);
});

test("the widget renders in an iframe on another origin without third-party cookies", async ({
  page,
}) => {
  await page.context().clearCookies();
  const cookieControls = await page.context().newCDPSession(page);
  await cookieControls.send("Network.enable");
  await cookieControls.send("Network.setCookieControls", {
    enableThirdPartyCookieRestriction: true,
  });
  // A real network response gives Chrome the parent's loopback address space.
  // A route.fulfill document has no peer IP and triggers Local Network Access
  // blocking before the iframe loads, even when its URL says localhost.
  const owner = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(
      '<!doctype html><html lang="pl"><head><title>Test osadzenia</title></head><body><h1>Strona obiektu</h1><iframe title="Warunki dostępności" src="http://127.0.0.1:4174/embed/places/test-widget" width="360" height="800"></iframe></body></html>',
    );
  });
  await new Promise<void>((resolve, reject) => {
    owner.once("error", reject);
    owner.listen(0, "127.0.0.1", () => {
      owner.off("error", reject);
      resolve();
    });
  });
  const ownerOrigin = `http://localhost:${(owner.address() as AddressInfo).port}`;
  try {
    await page.route("**/api/place-passports/test-widget", (route) =>
      route.fulfill({ json: publicFixture() }),
    );
    await page.goto(`${ownerOrigin}/`);
    const frame = page.frameLocator('iframe[title="Warunki dostępności"]');
    await expect(
      frame.getByRole("heading", {
        name: publicFixture().place.name,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      frame.getByRole("link", {
        name: "Zaplanuj dojście w nowej karcie",
        exact: true,
      }),
    ).toHaveAttribute("target", "_blank");
    const embedded = await page
      .locator('iframe[title="Warunki dostępności"]')
      .elementHandle();
    const embeddedFrame = await embedded?.contentFrame();
    expect(await embeddedFrame?.evaluate(() => location.origin)).toBe(
      "http://127.0.0.1:4174",
    );
    expect(await page.evaluate(() => location.origin)).toBe(ownerOrigin);
  } finally {
    await cookieControls.detach();
    owner.closeAllConnections();
    await new Promise<void>((resolve) => owner.close(() => resolve()));
  }
});

test("a signed-in user saves a private draft, publishes, and sees identical data in the widget and history", async ({
  page,
}) => {
  const registration = await page.request.post("/api/auth/register", {
    data: {
      email: `passport-${Date.now()}@example.test`,
      password: testPassword,
      displayName: "Autor testowego obiektu",
    },
  });
  expect(registration.ok()).toBeTruthy();
  const account = await registration.json();
  const profile = {
    mobility: "power",
    widthCm: "83",
    maxIncline: "4",
    maxKerbCm: "1",
    avoidUnpaved: true,
  };
  expect(
    (
      await page.request.put("/api/profile", {
        data: {
          profile,
          expectedVersion: account.profileVersion,
          expectedUserId: account.user.id,
        },
      })
    ).ok(),
  ).toBeTruthy();
  await startObjects(page);
  const name = `TEST: Prywatny obiekt ${Date.now()}`;
  await page
    .getByRole("searchbox", { name: "Nazwa lub adres obiektu" })
    .fill(name);
  await page.getByRole("button", { name: "Szukaj", exact: true }).click();
  const creation = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/place-passports/drafts" &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "To inny obiekt. Dodaj nowy" })
    .click();
  const created = (await (await creation).json()) as PassportDraft;
  await expect(
    page.getByRole("heading", { name: "Dane Twojego obiektu" }),
  ).toBeVisible();
  await expect(page.getByLabel("Nazwa obiektu", { exact: true })).toHaveValue(
    name,
  );
  await page
    .getByLabel("Adres obiektu", { exact: true })
    .fill("Wyłącznie izolowany test interfejsu");
  const position = page.getByRole("group", {
    name: "Położenie obiektu",
    exact: true,
  });
  await position.getByLabel("Szerokość geograficzna").fill("50.061");
  await position.getByLabel("Długość geograficzna").fill("19.938");
  await page.getByLabel("Szerokość przejścia (cm)", { exact: true }).fill("94");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Mapa", exact: true })
    .click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Profil", exact: true })
    .click();
  await page.getByRole("button", { name: "Moje obiekty", exact: true }).click();
  await expect(
    page.getByLabel("Szerokość przejścia (cm)", { exact: true }),
  ).toHaveValue("94");
  const width = page.locator(".passport-edit-fact").filter({
    has: page.getByLabel("Szerokość przejścia (cm)", { exact: true }),
  });
  await width.locator("summary").click();
  await width
    .getByLabel("Źródło tej informacji")
    .fill("Pomiar wyłącznie testowy");
  await width
    .getByLabel("Data obserwacji lub pomiaru (opcjonalna)")
    .fill("2025-01-01");
  await page
    .getByRole("button", { name: "Dodaj wejście", exact: true })
    .click();
  const entrance = page.locator(".passport-edit-entrance").first();
  await entrance
    .getByLabel("Nazwa wejścia 1", { exact: true })
    .fill("Wejście od dziedzińca");
  await entrance.getByLabel("Schody", { exact: true }).selectOption("no");
  await entrance
    .getByLabel("Szerokość przejścia (cm)", { exact: true })
    .fill("90");
  await entrance.getByLabel("Szerokość geograficzna").fill("50.0615");
  await entrance.getByLabel("Długość geograficzna").fill("19.9391");
  await page.getByRole("button", { name: "Zapisz szkic", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Prywatny szkic zapisany" }),
  ).toBeVisible();
  expect(
    (
      await page.request.get(`/api/place-passports/${created.placeId}`)
    ).status(),
  ).toBe(404);
  await page.getByRole("button", { name: "Zapisz i zobacz podgląd" }).click();
  await expect(
    page.getByRole("heading", { name: "Sprawdź przed publikacją" }),
  ).toBeVisible();
  await expect(page.locator(".passport-card")).toContainText("94 cm");
  await expect(page.locator(".passport-card")).toContainText(
    "PRYWATNY PODGLĄD",
  );
  await page.getByRole("button", { name: "Opublikuj", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Dane opublikowane" }),
  ).toBeVisible();
  await expect(page.locator(".passport-card")).toHaveAttribute(
    "data-passport-revision",
    "1",
  );
  await expect(page.getByLabel("Kod do osadzenia")).toHaveValue(
    new RegExp(`/embed/places/${created.placeId}`),
  );
  await page.getByRole("button", { name: "Pokaż historię publikacji" }).click();
  await expect(page.locator(".passport-history")).toContainText(
    "Autor testowego obiektu",
  );
  await expect(page.locator(".passport-history")).toContainText(
    "Szerokość przejścia",
  );
  const widget = await page.context().newPage();
  await widget.goto(`/embed/places/${created.placeId}`);
  await expect(
    widget.getByRole("heading", { name, exact: true }),
  ).toBeVisible();
  await expect(widget.locator(".passport-card")).toHaveAttribute(
    "data-passport-revision",
    "1",
  );
  await expect(
    widget
      .locator(".passport-fact")
      .filter({
        has: widget.locator("dt").filter({ hasText: /^Szerokość przejścia$/ }),
      })
      .first(),
  ).toContainText("94 cm");
  await widget.getByText("Wejście od dziedzińca", { exact: true }).click();
  const routeRequests: string[] = [];
  await page.context().route("**/api/route", (route) => {
    routeRequests.push(route.request().method());
    return route.fulfill({
      status: 503,
      json: {
        error: {
          message: "Nie wywołuj silnika tras automatycznie w tym teście.",
        },
      },
    });
  });
  const opened = page.context().waitForEvent("page");
  await widget
    .getByRole("link", { name: /Zaplanuj dojście do tego wejścia/ })
    .click();
  const destination = await opened;
  await expect(
    destination.getByRole("combobox", { name: "Dokąd", exact: true }),
  ).toHaveValue(`${name} · Wejście od dziedzińca`);
  await destination
    .getByRole("navigation")
    .getByRole("button", { name: "Profil", exact: true })
    .click();
  const activePreset = destination.locator(".preset-card.active");
  await expect(activePreset).toContainText("Wózek elektryczny");
  await activePreset.getByRole("button", { name: "Edytuj", exact: true }).click();
  await expect(
    destination.getByLabel("Szerokość całkowita z wyposażeniem", {
      exact: false,
    }),
  ).toHaveValue("83");
  await destination.getByText("Dostosuj warunki przejazdu", { exact: true }).click();
  await expect(
    destination.getByLabel("Maksymalny wygodny podjazd (%)", { exact: true }),
  ).toHaveValue("4");
  await expect(
    destination.getByLabel("Maksymalny krawężnik (cm)", { exact: true }),
  ).toHaveValue("1");
  await expect(
    destination.getByRole("checkbox", {
      name: "Unikaj nieutwardzonej nawierzchni",
    }),
  ).toBeChecked();
  await destination.getByRole("button", { name: "Zamknij", exact: true }).click();
  await destination.getByRole("button", { name: "Wróć do planowania", exact: true }).click();
  await expect(
    destination.getByRole("combobox", { name: "Dokąd", exact: true }),
  ).toHaveValue(`${name} · Wejście od dziedzińca`);
  expect(routeRequests).toEqual([]);
  await destination.close();
  await widget.close();
});

test("account changes discard private UI and ignore a delayed draft response", async ({
  page,
}) => {
  let account: { id: string; email: string; displayName: string } | null = {
    id: "test-account-a",
    email: "a@example.test",
    displayName: "Konto A",
  };
  const secretDraft: PassportDraft = {
    id: "draft-a",
    placeId: "private-a",
    draftVersion: 1,
    baseRevision: 0,
    content: {
      ...emptyPassportContent(),
      place: {
        ...emptyPassportContent().place,
        name: "PRYWATNY SZKIC KONTA A",
      },
    },
    createdAt: "2025-01-01T12:00:00Z",
    updatedAt: "2025-01-01T12:00:00Z",
  };
  let release: (() => void) | undefined;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = false;
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      json: { user: account, profile: null, profileVersion: 0 },
    }),
  );
  await page.route("**/api/place-passports/mine?*", (route) =>
    route.fulfill({
      json: { drafts: account ? [secretDraft] : [], places: [] },
    }),
  );
  await page.route("**/api/place-passports/drafts/draft-a?*", async (route) => {
    requested = true;
    await delayed;
    await route.fulfill({ json: secretDraft }).catch(() => {});
  });
  await startObjects(page);
  await page.getByRole("button", { name: /PRYWATNY SZKIC KONTA A/ }).click();
  await expect.poll(() => requested).toBeTruthy();
  account = null;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("button", { name: "Zaloguj się, aby dodać dane" }),
  ).toBeVisible();
  release?.();
  await expect(
    page.getByText("PRYWATNY SZKIC KONTA A", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Dane Twojego obiektu" }),
  ).toHaveCount(0);
});

test("a concurrent publication is reviewed and rebased explicitly without losing the user's edit", async ({
  page,
  browser,
}) => {
  const first = await page.request.post("/api/auth/register", {
    data: {
      email: `passport-race-a-${Date.now()}@example.test`,
      password: testPassword,
      displayName: "Pierwszy autor konfliktu",
    },
  });
  expect(first.ok()).toBeTruthy();
  const userA = (await first.json()).user;
  let draftA = (await (
    await page.request.post("/api/place-passports/drafts", {
      data: { expectedUserId: userA.id },
    })
  ).json()) as PassportDraft;
  const content = emptyPassportContent();
  content.place = {
    name: "TEST: Wspólnie edytowany obiekt",
    category: "culture",
    address: "Wyłącznie test konfliktu",
    coordinates: [19.938, 50.061],
    website: null,
  };
  content.fields.widthCm.value = 90;
  draftA = await (
    await page.request.put(`/api/place-passports/drafts/${draftA.id}`, {
      data: {
        content,
        expectedDraftVersion: draftA.draftVersion,
        expectedUserId: userA.id,
      },
    })
  ).json();
  const initialPublication = await page.request.post(
    `/api/place-passports/drafts/${draftA.id}/publish`,
    {
      data: {
        expectedDraftVersion: draftA.draftVersion,
        expectedPublishedRevision: 0,
        expectedUserId: userA.id,
      },
    },
  );
  expect(initialPublication.ok()).toBeTruthy();
  const other = await browser.newContext({ baseURL: "http://127.0.0.1:4174" });
  try {
    const second = await other.request.post("/api/auth/register", {
      data: {
        email: `passport-race-b-${Date.now()}@example.test`,
        password: testPassword,
        displayName: "Drugi autor konfliktu",
      },
    });
    expect(second.ok()).toBeTruthy();
    const userB = (await second.json()).user;
    let draftB = (await (
      await other.request.post("/api/place-passports/drafts", {
        data: { placeId: draftA.placeId, expectedUserId: userB.id },
      })
    ).json()) as PassportDraft;
    await page.addInitScript(() =>
      localStorage.setItem("przejscie-onboarding", JSON.stringify("skipped")),
    );
    await page.goto(`/app?objects=${draftA.placeId}`);
    await expect(
      page.getByRole("heading", { name: "Dane Twojego obiektu" }),
    ).toBeVisible();
    const currentDraft = (await (
      await page.request.get(
        `/api/place-passports/drafts/${draftA.id}?expectedUserId=${userA.id}`,
      )
    ).json()) as PassportDraft;
    currentDraft.content.fields.widthCm.value = 91;
    expect(
      (
        await page.request.put(
          `/api/place-passports/drafts/${currentDraft.id}`,
          {
            data: {
              content: currentDraft.content,
              expectedDraftVersion: currentDraft.draftVersion,
              expectedUserId: userA.id,
            },
          },
        )
      ).ok(),
    ).toBeTruthy();
    await page
      .getByLabel("Szerokość przejścia (cm)", { exact: true })
      .fill("92");
    await page.getByRole("button", { name: "Zapisz i zobacz podgląd" }).click();
    await expect(
      page.getByRole("heading", { name: "Ten szkic zapisano w innej karcie" }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Szerokość przejścia (cm)", { exact: true }),
    ).toHaveValue("92");
    await page
      .getByRole("button", { name: "Wczytaj szkic z drugiej karty" })
      .click();
    await expect(
      page.getByLabel("Szerokość przejścia (cm)", { exact: true }),
    ).toHaveValue("91");
    await page
      .getByLabel("Szerokość przejścia (cm)", { exact: true })
      .fill("92");
    await page.getByRole("button", { name: "Zapisz i zobacz podgląd" }).click();
    await expect(
      page.getByRole("heading", { name: "Sprawdź przed publikacją" }),
    ).toBeVisible();
    draftB.content.fields.widthCm.value = 100;
    draftB = await (
      await other.request.put(`/api/place-passports/drafts/${draftB.id}`, {
        data: {
          content: draftB.content,
          expectedDraftVersion: draftB.draftVersion,
          expectedUserId: userB.id,
        },
      })
    ).json();
    const concurrent = await other.request.post(
      `/api/place-passports/drafts/${draftB.id}/publish`,
      {
        data: {
          expectedDraftVersion: draftB.draftVersion,
          expectedPublishedRevision: 1,
          expectedUserId: userB.id,
        },
      },
    );
    expect(concurrent.ok()).toBeTruthy();
    await page.getByRole("button", { name: "Opublikuj", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "W międzyczasie zmieniły się opublikowane dane",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Opublikuj", exact: true }),
    ).toBeDisabled();
    await page
      .getByText("Zobacz aktualną opublikowaną wersję", { exact: true })
      .click();
    await expect(page.locator(".passport-conflict-review")).toContainText(
      "100 cm",
    );
    await page
      .getByRole("button", { name: "Połącz z aktualną wersją" })
      .click();
    await expect(
      page.getByLabel("Szerokość przejścia (cm)", { exact: true }),
    ).toHaveValue("92");
    await page.getByRole("button", { name: "Zapisz i zobacz podgląd" }).click();
    await page.getByRole("button", { name: "Opublikuj", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Dane opublikowane" }),
    ).toBeVisible();
    await expect(page.locator(".passport-card")).toHaveAttribute(
      "data-passport-revision",
      "3",
    );
    await expect(page.locator(".passport-fact-conflict")).toContainText(
      "92 cm",
    );
    await expect(page.locator(".passport-fact-conflict")).toContainText(
      "100 cm",
    );
  } finally {
    await other.close();
  }
});

test("optional site verification creates a scoped meta token and shows its confirmed status", async ({
  page,
}) => {
  const user = {
    id: "verification-author",
    email: "verification@example.test",
    displayName: "Autor strony",
  };
  const content = emptyPassportContent();
  content.place = {
    name: "TEST: Strona obiektu",
    category: "culture",
    address: "Dane testowe",
    coordinates: [19.938, 50.061],
    website: "https://example.test",
  };
  const draft: PassportDraft = {
    id: "verification-draft",
    placeId: "verification-place",
    draftVersion: 1,
    baseRevision: 0,
    content,
    createdAt: "2025-01-01T12:00:00Z",
    updatedAt: "2025-01-01T12:00:00Z",
  };
  const record = {
    id: "challenge-id",
    host: "example.test",
    verificationUrl: "https://example.test/",
    status: "pending",
    challengeExpiresAt: "2030-01-02T12:00:00Z",
    verifiedAt: null,
    expiresAt: null,
    lastCheckedAt: null,
    lastErrorCode: null,
  };
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ json: { user, profile: null, profileVersion: 0 } }),
  );
  await page.route("**/api/place-passports/mine?*", (route) =>
    route.fulfill({ json: { drafts: [], places: [] } }),
  );
  await page.route("**/api/place-passports/drafts", (route) =>
    route.fulfill({ json: draft }),
  );
  await page.route("**/api/site-verifications?*", (route) =>
    route.fulfill({ json: { verifications: [] } }),
  );
  await page.route("**/api/site-verifications", (route) => {
    expect(route.request().postDataJSON()).toEqual({
      websiteUrl: "https://example.test",
      expectedUserId: user.id,
    });
    return route.fulfill({
      status: 201,
      json: {
        verification: record,
        metaTag:
          '<meta name="przejscie-site-verification" content="isolated-test-token">',
      },
    });
  });
  await page.route("**/api/site-verifications/challenge-id/check", (route) => {
    expect(route.request().postDataJSON()).toEqual({ expectedUserId: user.id });
    return route.fulfill({
      json: {
        verification: {
          ...record,
          status: "verified",
          verifiedAt: "2025-01-01T12:00:00Z",
          expiresAt: "2030-01-01T12:00:00Z",
        },
        verified: true,
      },
    });
  });
  await page.addInitScript(() =>
    localStorage.setItem("przejscie-onboarding", JSON.stringify("skipped")),
  );
  await page.goto("/app?objects=verification-place");
  await expect(
    page.getByRole("heading", { name: "Dane Twojego obiektu" }),
  ).toBeVisible();
  await page
    .getByText("Opcjonalnie: potwierdź stronę obiektu", { exact: true })
    .click();
  await page.getByRole("button", { name: "Wygeneruj nowy znacznik" }).click();
  await expect(page.getByLabel("Znacznik dla example.test")).toHaveValue(
    '<meta name="przejscie-site-verification" content="isolated-test-token">',
  );
  await page
    .getByRole("button", { name: "Sprawdź znacznik", exact: true })
    .click();
  await expect(
    page.locator(".passport-domain").getByRole("status"),
  ).toContainText("Potwierdzono kontrolę nad stroną example.test");
  await expect(page.locator(".passport-verifications")).toContainText(
    "Ważne do",
  );
});
