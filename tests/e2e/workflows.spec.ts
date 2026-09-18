import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mockFeeds } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await mockFeeds(page);
});
for (const width of [375, 768, 1024, 1440]) {
  test(`signals workflow and accessibility at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Signals", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("2 signals", { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "All signals", exact: true })
      .click();
    await expect(page.getByText("3 signals", { exact: true })).toBeVisible();
    await page
      .getByRole("textbox", { name: "Filter event or perp" })
      .fill("zzzz");
    await expect(
      page.getByRole("heading", { name: "No matching signals" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Show all signals" }).click();
    await page
      .getByRole("textbox", { name: "Filter event or perp" })
      .fill("Bitcoin");
    await expect(page.getByText("1 signal", { exact: true })).toBeVisible();
    await page
      .getByRole("combobox", { name: "Comparison window" })
      .selectOption("1h");
    await expect(page.getByText("1 signal", { exact: true })).toBeVisible();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({ path: `test-results/signals-${width}.png` });
    const row = page.locator(
      width >= 1280 ? "#signal-1-BTC-USD" : "#signal-mobile-1-BTC-USD",
    );
    await row.click();
    if (width < 1280) await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("link", { name: "Open BTC desk" }).last().click();
    await expect(page).toHaveURL(/\/markets\/BTC-USD\?event=1/);
    await expect(
      page.getByRole("heading", { name: "BTC trading desk" }),
    ).toBeAttached();
    if (width < 1280)
      await page.getByRole("button", { name: "Trade", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Order ticket" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Limit", exact: true }).click();
    await page.getByLabel("Price", { exact: true }).fill("-1");
    await expect(
      page.getByText("Enter a positive limit price.", { exact: false }),
    ).toBeVisible();
    const tradeAudit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      tradeAudit.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
    await page.screenshot({ path: `test-results/trade-${width}.png` });
  });
}
test("market filters, navigation, guide and portfolio", async ({ page }) => {
  await page.goto("/markets");
  await expect(page.getByRole("link", { name: /BTC/ })).toBeVisible();
  await page.getByRole("button", { name: "Equities", exact: true }).click();
  await expect(page.getByRole("link", { name: /AAPL/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /BTC/ })).toHaveCount(0);
  // Enter activates the focused filter rather than a global market-navigation shortcut.
  await page.getByRole("button", { name: "Crypto", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/markets$/);
  await page.getByRole("link", { name: /BTC/ }).click();
  await expect(page).toHaveURL(/BTC-USD/);
  for (const path of ["/portfolio", "/about", "/not-a-page"]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
    await page.screenshot({ path: `test-results/${path.slice(1)}.png` });
  }
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
test("failed market feed has recovery and does not spin forever", async ({
  page,
}) => {
  await page.route("**/api/markets", (r) =>
    r.fulfill({ status: 503, json: { error: "upstream" } }),
  );
  await page.goto("/markets");
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByRole("button", { name: "Retry", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/market-error.png" });
});

test("all secondary surfaces stay usable at every supported width", async ({
  page,
}) => {
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/markets", "/portfolio", "/about"]) {
      await page.goto(path);
      await expect(page.locator("h1")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
      const a = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(a.violations.map((v) => v.id)).toEqual([]);
      await page.screenshot({
        path: `test-results/${path.slice(1)}-${width}.png`,
      });
    }
  }
});
test("chart controls and reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/markets/BTC-USD");
  await expect(page.locator("canvas").first()).toBeVisible();
  for (const name of ["Candles", "Line", "Yes %", "Log", "Fit"]) {
    await page.getByRole("button", { name, exact: true }).click();
  }
  await page.screenshot({ path: "test-results/chart-controls.png" });
  expect(
    await page
      .locator("body")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
});
