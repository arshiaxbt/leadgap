import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { GapTrace } from "@/components/signal/GapTrace";
import { SocialLinks } from "@/components/SocialLinks";
import { SupportLeadgap } from "@/components/SupportLeadgap";
import { PERPS_INVITE_LABEL, PERPS_INVITE_URL } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Guide",
  description:
    "Understand event odds, mapped perpetual markets, and the Leadgap model.",
};

const EXAMPLE = {
  implied: [
    0, 0.002, 0.006, 0.01, 0.014, 0.018, 0.022, 0.025, 0.027, 0.029, 0.03,
  ],
  observed: [
    0, 0, 0.001, 0.0015, 0.001, 0.002, 0.004, 0.006, 0.008, 0.009, 0.01,
  ],
};

export default function AboutPage() {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <article className="guide-layout">
        <p className="text-[13px] text-subtle">The Leadgap guide</p>
        <h1 className="serif mt-3.5 text-[40px] leading-[1.08] sm:text-[52px]">
          Read the event.
          <br />
          <span className="text-odds italic">Understand the gap.</span>
        </h1>
        <p className="mt-[22px] max-w-[56ch] text-[16px] leading-[1.7] text-subtle">
          Leadgap compares changes in Polymarket event probabilities with
          related perpetual markets. Use it to investigate a divergence, then
          make your own trading decision.
        </p>
        <div className="mt-[22px] flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link
            href="/"
            className="lg-focus inline-flex items-center gap-2 text-[14px] text-odds"
          >
            Explore signals <ArrowRight size={16} aria-hidden />
          </Link>
          <Link
            href="/?tour=1"
            className="lg-focus text-[14px] text-subtle hover:text-text"
          >
            Take the 4-step tour
          </Link>
        </div>

        <section className="guide-section mt-10">
          <h2>01 · Find a signal</h2>
          <div>
            <p>
              Choose a comparison window on Signals. Candidates shows signals
              that pass eligibility, timing and estimated-cost checks.
              Divergences shows supported comparisons below those thresholds.
              All includes every supported comparison.
            </p>
            <p className="mt-3">
              Open a row for the full picture: the event question, Yes
              probability, and the reasoning behind the mapping. Save it to your
              watchlist or set an alert from there.
            </p>
          </div>
        </section>

        <section className="guide-section">
          <h2>02 · Read the gap</h2>
          <div>
            <p>
              The model multiplies the change in Yes probability by a signed
              sensitivity estimate — the implied move. It subtracts the observed
              perp return. What’s left is the gap.
            </p>
            <figure className="my-[22px] overflow-hidden rounded-[10px] border border-line bg-surface">
              <figcaption className="border-b border-line px-4 py-3 text-[11px] text-dim">
                Illustrative example · not a live signal
              </figcaption>
              <GapTrace
                trace={EXAMPLE}
                width={700}
                height={160}
                pad={16}
                dots={false}
                zero={false}
                strokeScale={1.3}
                className="h-[160px] w-full"
              />
              <div className="flex flex-wrap gap-6 border-t border-line px-4 py-3.5 text-[12px] text-subtle">
                <span>
                  Implied <b className="num font-medium text-odds">+3.00%</b>
                </span>
                <span>
                  Observed <b className="num font-medium text-mark">+1.00%</b>
                </span>
                <span>
                  Gap <b className="num font-medium text-odds">+2.00%</b>
                </span>
              </div>
            </figure>
            <p>
              A higher score reflects the residual, mapping confidence,
              movement, and liquidity. It is not a probability of success, and
              the separate timing estimate measures association at minute resolution, not causation.
              See the{" "}
              <Link
                href="/model"
                className="lg-focus text-odds underline underline-offset-2"
              >
                Model
              </Link>{" "}
              page for the full breakdown.
            </p>
          </div>
        </section>

        <section className="guide-section">
          <h2>03 · Inspect the market</h2>
          <div>
            <p>
              Open the related desk to compare its chart, event odds, order
              book, and funding. You’re trading a perpetual contract, not the
              event’s Yes or No shares.
            </p>
            <p className="mt-3">
              Check the freshness stamp. Delayed or interrupted feeds show the
              last available values — model estimates and historical
              relationships can both be wrong.
            </p>
          </div>
        </section>

        <section className="guide-section">
          <h2>04 · Connect and trade</h2>
          <div>
            <p>
              Trading requires a connected wallet, a supported location, and
              Polymarket Perps access. The first connection may request a
              signature to create a trading session. Review market, direction,
              size, price, and leverage before submitting.
            </p>
            <a
              href={PERPS_INVITE_URL}
              target="_blank"
              rel="noreferrer"
              className="lg-focus mt-3.5 inline-flex items-center gap-1.5 text-[14px] text-odds"
            >
              {PERPS_INVITE_LABEL} <ArrowUpRight size={13} aria-hidden />
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
              No Leadgap builder fee. Venue trading fees, funding, and
              liquidation charges may still apply.
            </p>
            <p className="mt-3">
              This is not financial advice. Event odds can be wrong, liquidity
              can disappear, and leveraged positions can be liquidated. Treat
              every score and estimated liquidation price as an approximation.
            </p>
          </div>
        </section>

        <section className="guide-section">
          <h2>06 · What Leadgap stores</h2>
          <div>
            <p>
              Signed out, your watchlist and alert rules stay in this browser
              and never reach a server. Signed in, they live in your account so
              the research service can check alerts while Leadgap is closed,
              and only that account can read them.
            </p>
            <p className="mt-3">
              Login is handled by Privy; Leadgap sees the account identifier it
              returns, plus any wallet you connect for trading. Usage counters
              are per-day totals of a fixed set of product events — which
              screens and actions get used — with no identifiers, addresses or
              question text attached.
            </p>
            <p className="mt-3">
              Market data, odds and prices come from Polymarket. Referral links
              carry <span className="num">via=arshia</span> so Polymarket can
              credit Leadgap; that is disclosed wherever the link appears.
            </p>
          </div>
        </section>

        <SupportLeadgap />

        <footer className="mt-9 flex flex-wrap items-center justify-between gap-5 border-t border-line pt-6">
          <Link
            href="/markets"
            className="lg-focus text-[14px] hover:text-odds"
          >
            Browse all markets →
          </Link>
          <SocialLinks />
        </footer>
      </article>
    </div>
  );
}
