import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("reading preferences are immediate, accessible on a small screen and survive reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app");
  await page.getByRole("button", { name: "Na razie pomiń" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Twój profil", exact: true })
    .click();
  await page.locator(".display-settings summary").click();
  await page
    .getByRole("button", { name: /Większy tekst Czytelniejsze/ })
    .click();
  await page
    .getByRole("button", { name: /Mocniejszy kontrast Wyraźniejsze/ })
    .click();
  await page.getByRole("button", { name: /Mniej ruchu Spokojna/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-text-size", "large");
  await expect(page.locator("html")).toHaveAttribute("data-contrast", "high");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
  await expect(page.getByLabel("Szerokość z wystającymi elementami")).toHaveCSS(
    "font-size",
    "18px",
  );
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.locator(".display-settings").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "artifacts/goal-reading-mobile.png" });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Dokąd ruszamy?" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-text-size", "large");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
  await expect(
    page.getByRole("combobox", { name: "Skąd", exact: true }),
  ).toHaveCSS("font-size", "18px");
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Twój profil", exact: true })
    .click();
  await page.locator(".display-settings summary").click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.goto("/gra");
  await expect(page.getByRole("heading", { name: /Zbieraj iskry/ })).toBeVisible();
  await expect(page.locator(".ig-bird > svg")).toHaveCSS(
    "animation-name",
    "none",
  );
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { scrollBehaviors: string[] }).scrollBehaviors = seen;
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (options) {
      if (typeof options === "object" && options.behavior)
        seen.push(options.behavior);
      original.call(this, options);
    };
  });
  await page.getByRole("button", { name: /Brama z niespodzianką/ }).click();
  await page.evaluate(() =>
    (window as unknown as { scrollBehaviors: string[] }).scrollBehaviors.splice(
      0,
    ),
  );
  await page
    .getByRole("button", { name: /Przed wejściem jest stopień/ })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { scrollBehaviors: string[] }).scrollBehaviors
            .length,
      ),
    )
    .toBeGreaterThan(0);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { scrollBehaviors: string[] }).scrollBehaviors,
    ),
  ).not.toContain("smooth");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
