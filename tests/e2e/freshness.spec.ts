import { test, expect } from "@playwright/test";

test("an open page stops marking an expired report as current without reloading", async ({
  page,
}) => {
  const now = Date.now();
  await page.clock.install({ time: now });
  await page.route("**/api/reports", (route) =>
    route.fulfill({
      json: {
        reports: [
          {
            id: "expiry-fixture",
            kind: "obstacle",
            coordinates: [19.939, 50.063],
            description:
              "Kontrolowana obserwacja testowa przeszkody, bez zapisu w bazie.",
            widthCm: null,
            status: "active",
            createdAt: new Date(now - 86400000 + 15000).toISOString(),
            resolvedAt: null,
            ageHours: 23.99,
            stale: false,
            sourceLabel: "Test",
            canResolve: false,
          },
        ],
      },
    }),
  );
  await page.goto("/app");
  await page.getByRole("button", { name: "Na razie pomiń" }).click();
  await expect(page.locator(".report-pin")).toHaveCount(1);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Wspólnie", exact: true })
    .click();
  await expect(page.locator(".report-card")).toContainText("Do potwierdzenia");
  await page.clock.fastForward(30000);
  await expect(page.locator(".report-card")).toContainText(
    "Starsza obserwacja",
  );
  await expect(page.locator(".report-pin")).toHaveCount(0);
  await expect(page.locator(".report-card")).toContainText(
    "Kontrolowana obserwacja",
  );
});
