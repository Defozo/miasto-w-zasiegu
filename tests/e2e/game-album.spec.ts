import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const TRAINING_KEY = "iskry-miasta-training-v1";
const ALBUM_KEY = "iskry-miasta-album-v1:training";
const training = {
  completed: [
    "training-kerb",
    "training-width",
    "training-surface",
    "training-source",
    "training-rest",
    "training-entry",
  ],
  unlocked: ["flowers", "lantern", "pond", "tree"],
  decorations: [
    { slot: 0, itemId: "flowers" },
    { slot: 1, itemId: "tree" },
    { slot: 2, itemId: "pond" },
    { slot: 3, itemId: "lantern" },
  ],
};

async function completedTraining(page: Page) {
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(value));
    },
    { key: TRAINING_KEY, value: training },
  );
}
async function saveCard(page: Page, name: string) {
  await page.getByLabel("Nazwa nowej pocztówki", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: "Zachowaj ten widok", exact: true })
    .click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

test("completed training keeps three named snapshots, previews, explicitly replaces and deletes without rewards", async ({
  page,
}) => {
  await completedTraining(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET" && request.url().includes("/api/"))
      writes.push(request.url());
  });
  await page.goto("/gra?tryb=ogrod");
  await expect(
    page.getByRole("button", { name: "Urządź i zachowaj ogród" }),
  ).toBeVisible();
  await expect(page.locator(".ig-garden-stats")).toContainText("0 iskier");
  await page.getByRole("link", { name: "Otwórz album ogrodu" }).click();
  await saveCard(page, "Pierwszy zakątek");
  const firstSnapshot = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!)[0],
    ALBUM_KEY,
  );
  expect(Object.keys(firstSnapshot).sort()).toEqual([
    "garden",
    "name",
    "savedAt",
    "slot",
  ]);
  expect(Object.keys(firstSnapshot.garden).sort()).toEqual([
    "decorations",
    "growth",
    "kinds",
  ]);
  expect(firstSnapshot.garden.growth).toBe(75);
  expect(firstSnapshot.garden.kinds).toEqual([
    "rest_place",
    "step_free_entrance",
  ]);
  expect(firstSnapshot.garden.decorations).toEqual(training.decorations);
  await page.getByRole("button", { name: "Urządź i zachowaj ogród" }).click();
  await page
    .getByRole("button", {
      name: "Drzewo opowieści, odblokowana, ustaw bez kosztu, grządka 1",
      exact: true,
    })
    .click();
  await saveCard(page, "Cztery pory odpoczynku");
  await saveCard(page, "Na spokojny wieczór");
  await expect(page.locator(".ig-album-count")).toHaveText("3 z 3 pocztówek");
  await expect(
    page.getByRole("button", { name: "Zachowaj ten widok", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!)[0],
      ALBUM_KEY,
    ),
  ).toEqual(firstSnapshot);
  const open = page.getByRole("button", {
    name: "Powiększ pocztówkę: Pierwszy zakątek",
    exact: true,
  });
  await open.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Pierwszy zakątek" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("img")).toHaveAttribute(
    "aria-label",
    /Pierwszy zakątek.*4 ozdobione grządki/,
  );
  await expect(
    dialog.getByText("Zapisany widok do oglądania.", { exact: false }),
  ).toBeVisible();
  await expect(dialog.locator(".ig-sprout-in").first()).toHaveCSS(
    "animation-name",
    "none",
  );
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(open).toBeFocused();
  await page
    .getByRole("button", {
      name: "Zastąp pocztówkę: Pierwszy zakątek",
      exact: true,
    })
    .click();
  await page.getByLabel("Nazwa zastępowanej pocztówki").fill("Nowa kompozycja");
  await page.getByRole("button", { name: "Anuluj", exact: true }).click();
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!)[0],
      ALBUM_KEY,
    ),
  ).toEqual(firstSnapshot);
  await page
    .getByRole("button", {
      name: "Zastąp pocztówkę: Pierwszy zakątek",
      exact: true,
    })
    .click();
  await page.getByLabel("Nazwa zastępowanej pocztówki").fill("Nowa kompozycja");
  await page
    .getByRole("button", { name: "Tak, zastąp widok", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Nowa kompozycja", exact: true }),
  ).toBeVisible();
  const replaced = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!)[0],
    ALBUM_KEY,
  );
  expect(
    replaced.garden.decorations.find(
      (item: { slot: number }) => item.slot === 0,
    ).itemId,
  ).toBe("tree");
  await page
    .getByRole("button", {
      name: "Usuń pocztówkę: Na spokojny wieczór",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Anuluj", exact: true }).click();
  await expect(page.locator(".ig-album-count")).toHaveText("3 z 3 pocztówek");
  await page
    .getByRole("button", {
      name: "Usuń pocztówkę: Na spokojny wieczór",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Tak, usuń pocztówkę", exact: true })
    .click();
  await page.reload();
  await expect(page.locator(".ig-album-count")).toHaveText("2 z 3 pocztówek");
  await expect(
    page.getByRole("heading", { name: "Nowa kompozycja", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".ig-garden-stats")).toContainText("0 iskier");
  const persisted = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    TRAINING_KEY,
  );
  expect(persisted.completed).toEqual(training.completed);
  expect(persisted.unlocked).toEqual(training.unlocked);
  expect(writes).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("link", { name: "Otwórz album ogrodu" }).click();
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
});

test("training and accounts have separate albums and changing accounts clears the previous view before loading", async ({
  page,
}) => {
  let account: { id: string; displayName: string } | null = {
    id: "album-a",
    displayName: "Pierwsze konto testowe",
  };
  let hold: Promise<void> | null = null;
  await page.route("**/api/auth/me", async (route) => {
    const value = account;
    if (hold) await hold;
    await route.fulfill({ json: { user: value } });
  });
  await page.route("**/api/game/state", async (route) => {
    if (hold) await hold;
    await route.fulfill({
      json: {
        authenticated: !!account,
        earned: 0,
        spent: 0,
        balance: 0,
        observations: 0,
        kinds: [],
        claimedMissions: [],
        unlocked: [],
        decorations: [],
        items: [],
      },
    });
  });
  await page.route("**/api/game/missions?**", (route) =>
    route.fulfill({ json: { missions: [] } }),
  );
  await page.goto("/gra?tryb=ogrod");
  await expect(page.locator(".ig-account")).toContainText(
    "Pierwsze konto testowe",
  );
  await saveCard(page, "Wspólny trening");
  await page.getByRole("button", { name: "Moje miasto", exact: true }).click();
  await expect(page.locator(".ig-album-count")).toHaveText("0 z 3 pocztówek");
  await saveCard(page, "Ogród pierwszego konta");
  await page
    .getByRole("button", {
      name: "Powiększ pocztówkę: Ogród pierwszego konta",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  let release!: () => void;
  hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  account = { id: "album-b", displayName: "Drugie konto testowe" };
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".ig-album")).toBeHidden();
  await expect(page.getByRole("dialog")).toBeHidden();
  release();
  hold = null;
  await expect(page.locator(".ig-account")).toContainText(
    "Drugie konto testowe",
  );
  await expect(page.locator(".ig-album-count")).toHaveText("0 z 3 pocztówek");
  await expect(
    page.getByRole("heading", { name: "Ogród pierwszego konta", exact: true }),
  ).toHaveCount(0);
  await saveCard(page, "Ogród drugiego konta");
  account = { id: "album-a", displayName: "Pierwsze konto testowe" };
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("heading", { name: "Ogród pierwszego konta", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Ogród drugiego konta", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("dialog")).toBeHidden();
  account = null;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("heading", { name: "Zabierz Iskrę do miasta." }),
  ).toBeVisible();
  await expect(page.locator(".ig-album")).toBeHidden();
  await page.getByRole("button", { name: "Trening", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Wspólny trening", exact: true }),
  ).toBeVisible();
  const keys = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith("iskry-miasta-album-v1:"))
      .sort(),
  );
  expect(keys).toEqual([
    "iskry-miasta-album-v1:account%3Aalbum-a",
    "iskry-miasta-album-v1:account%3Aalbum-b",
    ALBUM_KEY,
  ]);
});

test("unusable local data is bounded and failed storage does not claim a postcard was saved", async ({
  page,
}) => {
  await page.addInitScript(
    (key) =>
      localStorage.setItem(
        key,
        JSON.stringify([
          null,
          { slot: 0, name: "Błędny zapis", savedAt: "not-a-date", garden: {} },
          {
            slot: 8,
            name: "Poza limitem",
            savedAt: "2026-10-03T10:00:00Z",
            garden: {},
          },
        ]),
      ),
    ALBUM_KEY,
  );
  await page.goto("/gra?tryb=ogrod");
  await expect(page.locator(".ig-album-count")).toHaveText("0 z 3 pocztówek");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("iskry-miasta-album-v1:"))
        throw new DOMException(
          "Storage disabled for isolated test",
          "QuotaExceededError",
        );
      return original.call(this, key, value);
    };
  });
  await page
    .getByLabel("Nazwa nowej pocztówki", { exact: true })
    .fill("Niezapisany widok");
  await page
    .getByRole("button", { name: "Zachowaj ten widok", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Nie udało się zapisać albumu",
  );
  await expect(page.locator(".ig-album-count")).toHaveText("0 z 3 pocztówek");
  await expect(
    page.getByLabel("Nazwa nowej pocztówki", { exact: true }),
  ).toHaveValue("Niezapisany widok");
  await expect(page.locator(".ig-album-notice")).toBeEmpty();
});
