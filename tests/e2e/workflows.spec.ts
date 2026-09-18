import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mockFeeds } from "./fixtures";

const browserErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("pageerror", (e) => errors.push(e.message));
  await mockFeeds(page);
});
test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page)).toEqual([]);
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

test("referral disclosure, copy and event attribution", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/about#support");
  await expect(
    page.getByRole("heading", { name: "Support Leadgap" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open Polymarket", exact: true }),
  ).toHaveAttribute("href", "https://polymarket.com/?via=arshia");
  await page.getByRole("button", { name: "Copy referral link" }).click();
  await expect(page.getByText("Referral link copied.")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "https://polymarket.com/?via=arshia",
  );
  await page.goto("/");
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(
    page.getByRole("link", { name: "View event on Polymarket" }),
  ).toHaveAttribute("href", /\/event\/fixture-event-0\?via=arshia/);
});
test("compact results and order review at wide and short viewport sizes", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1440, height: 720 },
    { width: 375, height: 667 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/?window=1h&filter=all&symbol=BTC-USD&event=1");
    await expect(
      page.getByRole("combobox", { name: "Comparison window" }),
    ).toHaveValue("1h");
    await expect(
      page.getByRole("textbox", { name: "Filter event or perp" }),
    ).toHaveValue("BTC-USD");
    const footer = page.getByTestId("results-footer");
    await expect(footer).toBeVisible();
    const row = page.locator(
      viewport.width >= 1280 ? "#signal-1-BTC-USD" : "#signal-mobile-1-BTC-USD",
    );
    const rb = await row.boundingBox(),
      fb = await footer.boundingBox();
    expect(fb!.y - rb!.y - rb!.height).toBeLessThan(40);
    await page.screenshot({
      path: `test-results/compact-${viewport.width}-${viewport.height}.png`,
    });
    await page.goto("/markets/BTC-USD");
    if (viewport.width < 1280)
      await page.getByRole("button", { name: "Trade", exact: true }).click();
    await page.getByRole("button", { name: "Market", exact: true }).click();
    await page
      .getByRole("button", { name: "Review order", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Review BTC order" }),
    ).toBeVisible();
    await expect(
      dialog.getByText("Market · immediate or cancel"),
    ).toBeVisible();
    await expect(
      dialog.getByText("Determined by venue; excluded from margin estimate"),
    ).toBeVisible();
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(audit.violations.map((v) => v.id)).toEqual([]);
    await page.screenshot({
      path: `test-results/review-${viewport.width}-${viewport.height}.png`,
    });
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  }
});

test("signal history explains unavailable data and renders compatible observations", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/api/history?**", (r) =>
    r.fulfill({
      json: {
        batches: Array.from({ length: 6 }, (_, i) => {
          const t = Date.now() - (6 - i) * 60_000;
          return {
            t,
            modelVersion: "fixture-model",
            links: { "1": { "BTC-USD": 1 } },
            marks: { "BTC-USD": [t, 98000 + i * 10] },
            odds: { "1": [t, 0.6 + i * 0.01, "100"] },
          };
        }),
      },
    }),
  );
  await page.goto("/");
  await page.getByText("Signal history", { exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Residual over the available history" }),
  ).toBeVisible();
  await expect(
    page.getByText("Model fixture-", { exact: false }),
  ).toBeVisible();
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations.map((v) => v.id)).toEqual([]);
  await page
    .getByRole("img", { name: "Residual over the available history" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/signal-history.png" });
  await page.route("**/api/history?**", (r) =>
    r.fulfill({ status: 503, json: { error: "History unavailable" } }),
  );
  await page.reload();
  await page.getByText("Signal history", { exact: true }).click();
  await expect(
    page.getByText("Market data is unavailable. Please try again.", {
      exact: false,
    }),
  ).toBeVisible({ timeout: 15000 });
});
