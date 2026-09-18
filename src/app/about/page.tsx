import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { GapMeter } from "@/components/GapMeter";
import { SocialLinks } from "@/components/SocialLinks";
import { PERPS_INVITE_LABEL, PERPS_INVITE_URL } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Guide",
  description:
    "Understand event odds, mapped perpetual markets, and the Leadgap model.",
};
export default function AboutPage() {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <article className="guide-layout">
        <div className="mb-12 max-w-2xl">
          <p className="mb-4 text-sm text-[var(--muted)]">The Leadgap guide</p>
          <h1 className="text-4xl font-medium leading-tight tracking-tight sm:text-5xl">
            Read the event.
            <br />
            <span className="text-[var(--odds)]">Understand the gap.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-[var(--muted)]">
            Leadgap compares changes in Polymarket event probabilities with
            related perpetual markets. Use it to investigate a divergence, then
            make your own trading decision.
          </p>
          <Link
            href="/"
            className="lg-focus mt-6 inline-flex items-center gap-2 text-sm"
          >
            Explore signals <ArrowRight size={16} />
          </Link>
        </div>
        <section className="guide-section">
          <h2>01 · Find a signal</h2>
          <div>
            <p>
              Choose a comparison window on Signals. Tradeable shows signals
              that pass the model’s thresholds. Watching shows odds-led signals
              below those thresholds. All signals includes comparisons where the
              perp led or the moves are in line.
            </p>
            <p className="mt-3">
              Select a row to see the specific event question, Yes probability,
              linked market, and the reasoning behind the mapping.
            </p>
          </div>
        </section>
        <section className="guide-section">
          <h2>02 · Read the gap</h2>
          <div>
            <p>
              The model multiplies the change in Yes probability by a signed
              sensitivity estimate. It then subtracts the observed perp return.
              The difference is the remaining gap.
            </p>
            <div className="my-6 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-6">
              <p className="mb-5 text-xs">
                Illustrative example · not a live signal
              </p>
              <GapMeter expected={0.03} actual={0.01} />
              <dl className="mt-5 grid grid-cols-3 gap-3 text-xs text-[var(--muted)]">
                <div>
                  <dt>Model-implied</dt>
                  <dd className="num mt-2 text-lg text-[var(--odds)]">
                    +3.00%
                  </dd>
                </div>
                <div>
                  <dt>Observed</dt>
                  <dd className="num mt-2 text-lg text-[var(--mark)]">
                    +1.00%
                  </dd>
                </div>
                <div>
                  <dt>Gap</dt>
                  <dd className="num mt-2 text-lg text-[var(--odds)]">
                    +2.00%
                  </dd>
                </div>
              </dl>
            </div>
            <p>
              A higher score reflects the model’s residual, mapping confidence,
              movement, and liquidity factors. It is not a probability of
              success. “Odds first” is a magnitude heuristic within the selected
              window; it does not establish which market moved first in time or
              prove causation.
            </p>
          </div>
        </section>
        <section className="guide-section">
          <h2>03 · Inspect the market</h2>
          <div>
            <p>
              Open the related desk to compare its chart, event odds, order
              book, and funding. Choose Long or Short in the order ticket. You
              are trading a perpetual contract, not buying an event’s Yes or No
              shares.
            </p>
            <p className="mt-3">
              Check the data timestamp. Delayed or interrupted feeds may show
              the last available values. Model estimates can be wrong, and
              historical relationships can break.
            </p>
          </div>
        </section>
        <section className="guide-section">
          <h2>04 · Connect and trade</h2>
          <div>
            <p>
              Trading requires a connected wallet, a supported location, and
              Polymarket Perps access. The first connection may request a
              signature to create a trading session. Review the market,
              direction, quantity, price, leverage, and margin mode before
              submitting.
            </p>
            <a
              href={PERPS_INVITE_URL}
              target="_blank"
              rel="noreferrer"
              className="lg-focus mt-4 inline-flex items-center gap-1.5 text-sm"
            >
              {PERPS_INVITE_LABEL} <ArrowUpRight size={14} />
            </a>
            <p className="mt-3">
              Your account’s available access and balances are determined by
              Polymarket. Signing in to Leadgap does not grant Perps access.
            </p>
          </div>
        </section>
        <section className="guide-section">
          <h2>05 · Costs and risk</h2>
          <div>
            <p>
              Leadgap is configured with no builder add-on fee. Venue trading
              fees, funding, and liquidation charges may still apply. Review the
              venue’s current terms before trading.
            </p>
            <p className="mt-3">
              This tool is not financial advice. Event odds can be wrong,
              liquidity can disappear, and leveraged positions can be
              liquidated. Treat every score and estimated liquidation price as
              an approximation.
            </p>
          </div>
        </section>
        <footer className="mt-8 flex flex-wrap items-center justify-between gap-5 border-t border-[var(--line)] pt-6">
          <Link href="/markets" className="lg-focus text-sm">
            Browse all markets →
          </Link>
          <SocialLinks />
        </footer>
      </article>
    </div>
  );
}
