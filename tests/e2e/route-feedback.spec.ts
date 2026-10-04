import { test, expect, type Page } from "@playwright/test";
import type { Route } from "../../web/src/types";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function chooseAddress(page: Page, label: string, query: string) {
  const input = page.getByRole("combobox", { name: label, exact: true });
  await input.fill(query);
  await expect(
    page
      .getByRole("listbox", { name: `Podpowiedzi: ${label}` })
      .getByRole("option")
      .first(),
  ).toBeVisible();
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(input).toHaveAttribute("aria-expanded", "false");
}

async function openJourney(page: Page) {
  await page.goto("/app");
  await page.getByRole("button", { name: "Na razie pomiń" }).click();
  await chooseAddress(page, "Skąd", "Długa 12");
  await chooseAddress(page, "Dokąd", "Rynek Główny 1");
}

function planButton(page: Page) {
  return page.getByRole("button", {
    name: /^(Wyznacz trasę|Przelicz trasę|Szukamy przejścia…)$/,
  });
}

function feedback(page: Page) {
  return page.getByRole("status", { name: "Wynik planowania trasy" });
}

async function startWithKeyboard(page: Page) {
  const checkbox = page.getByRole("checkbox", {
    name: /Omijaj niedawno zgłoszone przeszkody/,
  });
  await checkbox.focus();
  await page.keyboard.press("Tab");
  await expect(planButton(page)).toBeFocused();
  await page.keyboard.press("Enter");
}

async function holdRealResponse(page: Page) {
  const ready = deferred<Route>();
  const release = deferred<void>();
  let requests = 0;
  await page.route("**/api/route", async (intercepted) => {
    requests++;
    try {
      // Calculate against the real isolated API/ORS; delay only delivery to the UI.
      const response = await intercepted.fetch();
      if (!response.ok()) {
        throw new Error(`Real route request failed: HTTP ${response.status()}`);
      }
      ready.resolve(await response.json());
      await release.promise;
      await intercepted.fulfill({ response });
    } catch (error) {
      ready.reject(error);
      await intercepted.abort().catch(() => {});
    }
  });
  return {
    ready: ready.promise,
    release: () => release.resolve(),
    count: () => requests,
  };
}

type FeedbackProbe = {
  originalNode: Element;
  messages: string[];
};

async function observeFeedback(page: Page) {
  await feedback(page).evaluate((element) => {
    const probe: FeedbackProbe = { originalNode: element, messages: [] };
    (window as typeof window & { feedbackProbe: FeedbackProbe }).feedbackProbe =
      probe;
    new MutationObserver(() => {
      probe.messages.push(element.textContent?.trim() || "");
    }).observe(element, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });
}

async function feedbackProbe(page: Page) {
  return feedback(page).evaluate((element) => {
    const probe = (window as typeof window & { feedbackProbe: FeedbackProbe })
      .feedbackProbe;
    return {
      sameNode: probe.originalNode === element,
      completed: probe.messages.filter((message) =>
        message.startsWith("Trasa gotowa."),
      ),
    };
  });
}

async function deliver(
  page: Page,
  held: Awaited<ReturnType<typeof holdRealResponse>>,
) {
  const response = page.waitForResponse(
    (item) =>
      item.url().endsWith("/api/route") && item.request().method() === "POST",
  );
  held.release();
  await (await response).finished();
  // Let response parsing and the resulting React commit finish before negative assertions.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

test("keyboard planning keeps focus and announces one short real result without duplicate requests", async ({
  page,
}) => {
  await openJourney(page);
  await expect(feedback(page)).toBeEmpty();
  await expect(feedback(page)).toHaveAttribute("aria-live", "polite");
  await expect(feedback(page)).toHaveAttribute("aria-atomic", "true");
  await observeFeedback(page);
  const held = await holdRealResponse(page);
  try {
    await startWithKeyboard(page);
    await expect(feedback(page)).toHaveText("Szukamy przejścia.");
    await expect(planButton(page)).toBeFocused();
    await expect(planButton(page)).toHaveAttribute("aria-disabled", "true");
    expect(
      await planButton(page).evaluate(
        (button: HTMLButtonElement) => button.disabled,
      ),
    ).toBe(false);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
    const route = await held.ready;
    await deliver(page, held);
    await expect(planButton(page)).toBeFocused();
    await expect(planButton(page)).toHaveAccessibleName("Przelicz trasę");
    await expect(planButton(page)).toHaveAttribute("aria-disabled", "false");
    const distance =
      route.distanceM >= 1000
        ? `${(route.distanceM / 1000).toFixed(1).replace(".", ",")} km`
        : `${Math.round(route.distanceM)} m`;
    await expect(feedback(page)).toHaveText(
      `Trasa gotowa. Długość ${distance}. Szacowany czas około ${Math.max(1, Math.round(route.durationS / 60))} min. Przejezdność nie jest potwierdzona na całej długości.`,
    );
    await expect(feedback(page)).not.toContainText(route.steps[0].instruction);
    await expect(
      page.getByRole("heading", { name: "Przebieg trasy" }),
    ).toBeVisible();
    const probe = await feedbackProbe(page);
    expect(probe.sameNode).toBe(true);
    expect(probe.completed).toHaveLength(1);
    expect(held.count()).toBe(1);
  } finally {
    held.release();
  }
});

test("a delayed route result leaves keyboard focus where the user moved it", async ({
  page,
}) => {
  await openJourney(page);
  const held = await holdRealResponse(page);
  try {
    await startWithKeyboard(page);
    await expect(feedback(page)).toHaveText("Szukamy przejścia.");
    await page.keyboard.press("Shift+Tab");
    const checkbox = page.getByRole("checkbox", {
      name: /Omijaj niedawno zgłoszone przeszkody/,
    });
    await expect(checkbox).toBeFocused();
    await held.ready;
    await deliver(page, held);
    await expect(feedback(page)).toContainText("Trasa gotowa.");
    await expect(checkbox).toBeFocused();
    expect(held.count()).toBe(1);
  } finally {
    held.release();
  }
});

test("a routing error keeps the initiating button focused and a keyboard retry can succeed", async ({
  page,
}) => {
  await openJourney(page);
  let requests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/route") && request.method() === "POST")
      requests++;
  });
  await page.route(
    "**/api/route",
    (intercepted) =>
      intercepted.fulfill({
        status: 503,
        json: {
          error: {
            code: "ROUTING_UNAVAILABLE",
            message: "Nie udało się teraz obliczyć trasy. Spróbuj ponownie.",
          },
        },
      }),
    { times: 1 },
  );
  await startWithKeyboard(page);
  await expect(page.getByRole("alert")).toContainText(
    "Nie udało się teraz obliczyć trasy.",
  );
  await expect(feedback(page)).toBeEmpty();
  await expect(planButton(page)).toBeFocused();
  await expect(page.locator(".route-result")).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(feedback(page)).toContainText("Trasa gotowa.", {
    timeout: 35000,
  });
  await expect(planButton(page)).toBeFocused();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(requests).toBe(2);
});

test("editing the address while waiting discards the old route and its completion announcement", async ({
  page,
}) => {
  await openJourney(page);
  await observeFeedback(page);
  const held = await holdRealResponse(page);
  try {
    await startWithKeyboard(page);
    await expect(feedback(page)).toHaveText("Szukamy przejścia.");
    await held.ready;
    const end = page.getByRole("combobox", { name: "Dokąd", exact: true });
    await end.fill("Niepotwierdzony nowy adres");
    await expect(feedback(page)).toBeEmpty();
    await deliver(page, held);
    await expect(end).toBeFocused();
    await expect(end).toHaveValue("Niepotwierdzony nowy adres");
    await expect(feedback(page)).toBeEmpty();
    await expect(page.locator(".route-result")).toHaveCount(0);
    await expect(planButton(page)).toBeDisabled();
    const probe = await feedbackProbe(page);
    expect(probe.sameNode).toBe(true);
    expect(probe.completed).toHaveLength(0);
    expect(held.count()).toBe(1);
  } finally {
    held.release();
  }
});

test("recalculating an opened saved plan keeps button focus and editing its address preserves the draft", async ({
  page,
}) => {
  await openJourney(page);
  await startWithKeyboard(page);
  await expect(feedback(page)).toContainText("Trasa gotowa.", {
    timeout: 35000,
  });
  await page.getByRole("button", { name: "Zapisz plan", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Otwórz zapisaną trasę" }).click();
  await expect(feedback(page)).toContainText("Otworzono zapisany plan.");
  await expect(page.locator(".route-result .notice")).toContainText(
    "Pokazujemy ustawienia zapisane z planem",
  );
  await observeFeedback(page);
  const buttonNode = await planButton(page).elementHandle();
  const held = await holdRealResponse(page);
  try {
    await startWithKeyboard(page);
    await expect(feedback(page)).toHaveText("Szukamy przejścia.");
    await expect(planButton(page)).toBeFocused();
    expect(await buttonNode!.evaluate((node) => node.isConnected)).toBe(true);
    await held.ready;
    await deliver(page, held);
    await expect(feedback(page)).toContainText("Trasa gotowa.");
    await expect(planButton(page)).toBeFocused();
    expect(await buttonNode!.evaluate((node) => node.isConnected)).toBe(true);
    const probe = await feedbackProbe(page);
    expect(probe.sameNode).toBe(true);
    expect(probe.completed).toHaveLength(1);
    expect(held.count()).toBe(1);

    // Reopen deliberately, then leave saved-view mode by editing a field.
    // The deliberate restore may reset the form; the following edit must not.
    await page.getByRole("button", { name: "Otwórz zapisaną trasę" }).click();
    await expect(feedback(page)).toContainText("Otworzono zapisany plan.");
    const end = page.getByRole("combobox", { name: "Dokąd", exact: true });
    await expect(end).toHaveValue(/^Rynek Główny 1/);
    const inputNode = await end.elementHandle();
    const draft = "Szkic po otwarciu zapisanego planu";
    await end.fill(draft);
    await expect(end).toHaveValue(draft);
    await expect(end).toBeFocused();
    expect(await inputNode!.evaluate((node) => node.isConnected)).toBe(true);
    await expect(feedback(page)).toBeEmpty();
    await expect(page.locator(".route-result")).toHaveCount(0);
    await expect(planButton(page)).toBeDisabled();
    expect(held.count()).toBe(1);
  } finally {
    held.release();
    await buttonNode?.dispose();
  }
});
