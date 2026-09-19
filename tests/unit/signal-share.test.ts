import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { signalShareMetadata, signalWindow } from "../../src/lib/signal-share";
import { findShareRow, SignalCard } from "../../src/lib/share-image";
import { gaps } from "../e2e/fixtures";

test("share metadata keeps window-specific page and image URLs with safe defaults", () => {
  for (const [value, window] of [["1h", "1h"], ["4h", "4h"], [undefined, "4h"], ["invalid", "4h"], [["1h", "4h"], "4h"]]) {
    const metadata = signalShareMetadata({ event: "1", symbol: "BTC-USD" }, value);
    assert.equal(signalWindow(value), window);
    assert.equal(metadata.openGraph?.url, `/signals/1/BTC-USD?window=${window}`);
    assert.ok(JSON.stringify(metadata.openGraph?.images).includes(`opengraph-image?window=${window}`));
    assert.ok(JSON.stringify(metadata.twitter?.images).includes(`twitter-image?window=${window}`));
  }
});

test("share lookup and rendered labels/numbers use the selected window", async () => {
  for (const window of ["1h", "4h"] as const) {
    const row = await findShareRow("1", "BTC-USD", window, async (selected) => {
      assert.equal(selected, window);
      return { gaps: [{ ...gaps[0], window: selected, expected: selected === "1h" ? .01 : .04 }] };
    });
    assert.ok(row);
    const markup = renderToStaticMarkup(createElement(SignalCard, { row }));
    assert.match(markup, new RegExp(`${window.toUpperCase()} WINDOW`));
    assert.ok(markup.includes(window === "1h" ? "+1.00%" : "+4.00%"));
  }
  assert.equal(await findShareRow("missing", "BTC-USD", "1h", async () => ({ gaps })), null);
  assert.equal(await findShareRow("1", "BTC-USD", "1h", async () => { throw new Error("unavailable"); }), null);
});
