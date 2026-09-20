import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mockFeeds, gaps } from "./fixtures";

const browserErrors = new WeakMap<Page, string[]>();
/** Server rendering is easy to lose silently, so fail on any hydration mismatch. */
const HYDRATION = /hydrat|did not match|text content does not match/i;
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && HYDRATION.test(m.text())) errors.push(m.text());
  });
  // The first-visit walkthrough has its own test; keep it out of the others.
  await page.addInitScript(() =>
    window.localStorage.setItem("leadgap:tour", "done"),
  );
  await mockFeeds(page);
});
test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page)).toEqual([]);
});

/** Let enter transitions (dialog fade/zoom) finish so axe never measures blended colors. */
async function settleAnimations(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
}

async function expectAccessible(page: Page) {
  await settleAnimations(page);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
}

async function expectNoOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
}

for (const width of [375, 768, 1024, 1440]) {
  test(`signals workflow and accessibility at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Signals", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("2 OF 3 SHOWN", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "All", exact: true }).click();
    await expect(page.getByText("3 OF 3 SHOWN", { exact: true })).toBeVisible();
    await page
      .getByRole("textbox", { name: "Filter event or perp" })
      .fill("zzzz");
    await expect(
      page.getByRole("heading", { name: "No matching signals" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Show all 3 signals" }).click();
    await page
      .getByRole("textbox", { name: "Filter event or perp" })
      .fill("Bitcoin");
    await expect(page.getByText("1 OF 3 SHOWN", { exact: true })).toBeVisible();
    const lens = page.getByRole("group", { name: "Comparison window" });
    await lens.getByRole("button", { name: "1h", exact: true }).click();
    await expect(
      lens.getByRole("button", { name: "1h", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("1 OF 3 SHOWN", { exact: true })).toBeVisible();
    await expectAccessible(page);
    await expectNoOverflow(page);
    await page.screenshot({ path: `test-results/signals-${width}.png` });

    if (width >= 1024) {
      await page.locator("#signal-1-BTC-USD").click();
      await expect(page).toHaveURL(/\/signals\/1\/BTC-USD\?window=1h/);
      await expect(
        page.getByRole("heading", {
          name: "Will Bitcoin exceed $100,000 before month end?",
        }),
      ).toBeVisible();
      await expectAccessible(page);
      await expectNoOverflow(page);
      await page.screenshot({ path: `test-results/detail-${width}.png` });
    } else {
      await page.locator("#signal-mobile-1-BTC-USD").click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectAccessible(page);
    }
    await page.getByRole("link", { name: "Open BTC desk" }).last().click();
    await expect(page).toHaveURL(/\/markets\/BTC-USD\?event=1/);
    await expect(
      page.getByRole("heading", { name: "BTC trading desk" }),
    ).toBeAttached();
    if (width < 1280)
      await page.getByRole("button", { name: "Trade", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Order ticket" }),
    ).toBeAttached();
    await expect(page.getByText("Signal agrees.")).toBeVisible();
    await page.getByRole("button", { name: "Limit", exact: true }).click();
    await page.getByLabel("Limit price", { exact: true }).fill("-1");
    await expect(
      page.getByText("Enter a positive limit price.", { exact: false }),
    ).toBeVisible();
    await expectAccessible(page);
    await expectNoOverflow(page);
    await page.screenshot({ path: `test-results/trade-${width}.png` });
  });
}

test("market filters, navigation, guide and portfolio", async ({ page }) => {
  await page.goto("/markets");
  await expect(page.getByRole("link", { name: /BTC/ })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Top signal: Long · 70" }),
  ).toBeVisible();
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
    await settleAnimations(page);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
    await page.screenshot({ path: `test-results/${path.slice(1)}.png` });
  }
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Watchlist", { exact: true })).toBeVisible();
  await page.keyboard.type("Bitcoin");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/events\/1$/);
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

test("interrupted signal feed keeps the last data and offers a retry", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("2 OF 3 SHOWN", { exact: true })).toBeVisible();
  await page.route("**/api/gaps?**", (r) =>
    r.fulfill({ status: 503, json: { error: "upstream" } }),
  );
  await page.getByRole("button", { name: "Refresh data" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Updates interrupted" }),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.locator("#signal-1-BTC-USD")).toBeAttached();
  await expect(
    page.getByRole("button", { name: "Retry feed", exact: true }),
  ).toBeVisible();
});

test("all secondary surfaces stay usable at every supported width", async ({
  page,
}) => {
  // 28 navigations plus an accessibility scan each, now server-rendered: this
  // runs close to the default budget on a warm machine and over it on a cold one.
  test.slow();
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [
      "/markets",
      "/watchlist",
      "/portfolio",
      "/model",
      "/about",
      "/events/1",
      "/signals/1/BTC-USD",
    ]) {
      await page.goto(path);
      await expect(page.locator("h1").first()).toBeVisible();
      await expectNoOverflow(page);
      await settleAnimations(page);
      const a = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(a.violations.map((v) => v.id)).toEqual([]);
      await page.screenshot({
        path: `test-results/${path.slice(1).replace(/\//g, "-")}-${width}.png`,
      });
    }
  }
});

test("chart controls and reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/markets/BTC-USD?event=1");
  await expect(page.locator("canvas").first()).toBeVisible();
  for (const name of ["Candles", "Line", "Yes %", "Residual", "Log", "Fit"]) {
    await page.getByRole("button", { name, exact: true }).click();
  }
  await expect(
    page.getByRole("button", { name: "Residual", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
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
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/signals/1/BTC-USD");
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
      page
        .getByRole("group", { name: "Comparison window" })
        .getByRole("button", { name: "1h", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("textbox", { name: "Filter event or perp" }),
    ).toHaveValue("BTC-USD");
    const footer = page.getByTestId("results-footer");
    await expect(footer).toBeVisible();
    const row =
      viewport.width >= 1024
        ? page.getByRole("row").filter({ has: page.locator("#signal-1-BTC-USD") })
        : page.locator("#signal-mobile-1-BTC-USD");
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
    await settleAnimations(page);
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

test("mobile desk Long and Short open the ticket on that side", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/markets/BTC-USD?event=1");
  await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
  await page.getByRole("button", { name: "Short", exact: true }).click();
  await expect(
    page
      .getByRole("group", { name: "Direction" })
      .getByRole("button", { name: "Short", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Against the signal.")).toBeVisible();
  await expectAccessible(page);
});

test("watch and alert a signal, then manage both on the watchlist", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/signals/1/BTC-USD?window=4h");
  await page.getByRole("button", { name: "Watch", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Watching", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Alert me", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Alert me on BTC" })).toBeVisible();
  await dialog.getByLabel("Score at least").fill("60");
  await dialog.getByLabel("Gap at least (%)").fill("1.5");
  await expectAccessible(page);
  await dialog.getByRole("button", { name: "Save alert" }).click();
  await expect(
    page.getByRole("button", { name: "Alert set", exact: true }),
  ).toBeVisible();

  await page.goto("/watchlist");
  await expect(page.getByText("Watching · 1")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Bitcoin above $100,000 this month?" }),
  ).toBeVisible();
  await expect(page.getByText("Alert rules · 1")).toBeVisible();
  await expect(
    page.getByRole("link", { name: /BTC · score ≥ 60 and gap ≥ 1\.5%/ }),
  ).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("button", { name: "Mute", exact: true }).click();
  await expect(page.getByText("Muted", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: /Remove Bitcoin above .* from watchlist/ })
    .click();
  await expect(page.getByText("Watching · 0")).toBeVisible();
  await page.screenshot({ path: "test-results/watchlist.png" });
});

test("a saved alert fires once when its signal crosses the thresholds", async ({
  page,
}) => {
  await page.addInitScript(() =>
    window.localStorage.setItem(
      "leadgap:watchlist:v1",
      JSON.stringify({
        items: [],
        rules: [
          {
            id: "1-BTC-USD-4h",
            symbol: "BTC-USD",
            eventId: "1",
            window: "4h",
            minScore: 60,
            minGap: 0.01,
            muted: false,
            createdAt: Date.now(),
            scoreVersion: "heuristic-v5",
          },
        ],
        alerts: {},
      }),
    ),
  );
  await page.goto("/");
  await expect(page.getByText("BTC alert · score 70")).toBeVisible();
  const stored = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("leadgap:watchlist:v1") ?? "{}"),
  );
  expect(stored.alerts["1-BTC-USD-4h"].matched).toBe(true);
  expect(stored.alerts["1-BTC-USD-4h"].lastFired).toBeGreaterThan(0);
});

test("first-visit walkthrough explains the row and can be dismissed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?tour=1");
  const tour = page.getByRole("dialog");
  await expect(tour.getByText("STEP 1 OF 4")).toBeVisible();
  await expect(tour.getByRole("heading", { name: "One event. One perp." })).toBeVisible();
  await tour.getByRole("button", { name: "Next" }).click();
  await expect(
    tour.getByRole("heading", { name: "This band is the whole product." }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/tour.png" });
  await tour.getByRole("button", { name: "Next" }).click();
  await tour.getByRole("button", { name: "Next" }).click();
  await tour.getByRole("button", { name: "Done" }).click();
  await expect(tour).not.toBeVisible();
  expect(
    await page.evaluate(() => window.localStorage.getItem("leadgap:tour")),
  ).toBe("done");
});

test("event view ranks mapped perpetuals and links to their desks", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/events/1");
  await expect(
    page.getByRole("heading", {
      name: "Will Bitcoin exceed $100,000 before month end?",
    }),
  ).toBeVisible();
  await expect(page.getByText("Gap +3.10%")).toBeVisible();
  await page.getByRole("link", { name: "Open desk →" }).click();
  await expect(page).toHaveURL(/\/markets\/BTC-USD\?event=1&window=1h/);
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
  await page.goto("/signals/1/BTC-USD");
  await expect(page.getByText("Gap history · 6h")).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Residual over the available history" }),
  ).toBeVisible();
  await expect(page.getByText("fixture-model", { exact: false })).toBeVisible();
  await expectAccessible(page);
  await page.screenshot({ path: "test-results/signal-history.png" });
  await page.route("**/api/history?**", (r) =>
    r.fulfill({ status: 503, json: { error: "History unavailable" } }),
  );
  await page.reload();
  await expect(
    page.getByText("Market data is unavailable. Please try again.", {
      exact: false,
    }),
  ).toBeVisible({ timeout: 15000 });
});

test("signal pages advertise a generated share image", async ({
  page,
  request,
}) => {
  await page.goto("/signals/1/BTC-USD?window=1h");
  const og = await page
    .locator('meta[property="og:image"]')
    .getAttribute("content");
  expect(og).toContain("/signals/1/BTC-USD/opengraph-image?window=1h");
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", /\?window=1h$/);
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute("content", /twitter-image\?window=1h$/);
  await page.goto("/signals/1/BTC-USD?window=4h");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /opengraph-image\?window=4h$/);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    "content",
    "summary_large_image",
  );
  // Unknown or expired signals still get a branded card, never an error.
  for (const route of ["opengraph-image", "twitter-image"]) {
    const response = await request.get(`/signals/1/BTC-USD/${route}`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/png");
    expect((await response.body()).length).toBeGreaterThan(10_000);
  }
});

test('unknown evidence stays in divergences and explains the empty candidate feed',async({page})=>{
  await page.setViewportSize({width:375,height:850});
  await page.route('**/api/gaps?*',route=>route.fulfill({json:{gaps:gaps.map(g=>({...g,timing:{status:'unknown',reason:'insufficient-history',lagMinutes:null,correlation:null,samples:0,coverage:0},execution:{status:'unknown',reasons:['missing-quote-history'],at:0,notional:100,horizonMs:1800000}})),summary:{actionable:0,oddsFirst:3,topScore:70},asOf:Date.now(),error:null}}));
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'No research candidates right now.'})).toBeVisible();
  await expect(page.getByText(/3 comparisons lack clear odds leadership/)).toBeVisible();
  await page.getByRole('button',{name:'Divergences',exact:true}).click();
  await expect(page.getByText('3 OF 3 SHOWN',{exact:true})).toBeVisible();
  await expectAccessible(page);await expectNoOverflow(page);
});

test('a saved v4 alert is baselined on v5 without a manufactured notification',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('leadgap:watchlist:v1',JSON.stringify({items:[],rules:[{id:'legacy',symbol:'BTC-USD',eventId:'1',window:'4h',minScore:60,minGap:.01,muted:false}],alerts:{legacy:{matched:false,lastFired:123}}})));
  await page.goto('/');
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('leadgap:watchlist:v1')!).alerts.legacy.scoreVersion)).toBe('heuristic-v5');
  const alert=await page.evaluate(()=>JSON.parse(localStorage.getItem('leadgap:watchlist:v1')!).alerts.legacy);
  expect(alert.matched).toBe(true);expect(alert.lastFired).toBe(123);
  await expect(page.getByText('BTC alert · score 70')).not.toBeVisible();
});


test('legacy browser rules without previous evaluation state also baseline',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('leadgap:watchlist:v1',JSON.stringify({items:[],rules:[{id:'legacy',symbol:'BTC-USD',eventId:'1',window:'4h',minScore:60,minGap:.01,muted:false}],alerts:{}})));
  await page.goto('/');
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('leadgap:watchlist:v1')!).alerts.legacy?.scoreVersion)).toBe('heuristic-v5');
  const alert=await page.evaluate(()=>JSON.parse(localStorage.getItem('leadgap:watchlist:v1')!).alerts.legacy);
  expect(alert.matched).toBe(true);expect(alert.lastFired).toBe(0);
  await expect(page.getByText('BTC alert · score 70')).not.toBeVisible();
});
