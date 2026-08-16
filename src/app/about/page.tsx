import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/LogoMark";
import { PageShell } from "@/components/PageShell";
import { APP_BUILDER, APP_GITHUB, APP_NAME, APP_TAGLINE, APP_X, PERPS_WAITLIST_URL } from "@/lib/brand";

export const metadata: Metadata = {
  title: "About",
  description: APP_TAGLINE,
};

export default function AboutPage() {
  return (
    <PageShell>
      <article className="mx-auto max-w-2xl py-6 text-[14px] leading-6 text-[var(--muted)]">
        <div className="flex items-center gap-3">
          <LogoMark className="h-8 w-8 shrink-0" />
          <h1 className="event-title text-[28px] italic leading-8 text-[var(--text)]">{APP_NAME}</h1>
        </div>
        <p className="mt-2 text-[15px] text-[var(--text)]">{APP_TAGLINE}</p>
        <p className="mt-1 text-[13px]">
          Built by{" "}
          <a href={APP_X} target="_blank" rel="noreferrer" className="text-[var(--text)] hover:text-[var(--signal)]">
            {APP_BUILDER}
          </a>
        </p>
        <p className="mt-3">
          This is not a prediction-market site and not a perp DEX. It is a wire for event probability that prints into a
          Polymarket perp ticket. Discover the question, read why the mark has not followed, then trade the instrument.
        </p>

        <section className="mt-8 border-t border-[var(--line)] pt-4">
          <h2 className="lg-label">How to read it</h2>
          <dl className="mt-3 space-y-3">
            <div>
              <dt className="text-[var(--text)]">Wire</dt>
              <dd>
                Ranked Polymarket events whose Yes odds moved before the mapped perp. Select a row to read the brief.
                Open the desk to trade.
              </dd>
            </div>
            <div>
              <dt className="text-[var(--text)]">Markets</dt>
              <dd>
                The perp book: mark, index, funding, OI, and how many Polymarket events map to each instrument. Open a
                row for the desk — intel, chart, book, ticket.
              </dd>
            </div>
            <div>
              <dt className="text-[var(--text)]">Account</dt>
              <dd>Equity, event exposure, and blotter after you log in to Polymarket.</dd>
            </div>
          </dl>
        </section>

        <section className="mt-8 border-t border-[var(--line)] pt-4">
          <h2 className="lg-label">Act, Lead, All</h2>
          <dl className="mt-3 space-y-3">
            <div>
              <dt className="text-[var(--text)]">Act</dt>
              <dd>
                Odds moved first and the perp has not fully followed. These are Leadgap’s tradeable setups — long or
                short the mapped perp, not the event share.
              </dd>
            </div>
            <div>
              <dt className="text-[var(--text)]">Lead</dt>
              <dd>
                Odds are ahead of the mark, but the gap or confidence is not yet strong enough to act. Watch these; they
                can become Act as the residual opens.
              </dd>
            </div>
            <div>
              <dt className="text-[var(--text)]">All</dt>
              <dd>Every mapped print in the window, including perp-led and in-line. Useful for context, not the edge.</dd>
            </div>
            <div>
              <dt className="text-[var(--text)]">Window</dt>
              <dd>
                How far back the tape looks. Default is 4h. Shorter windows catch fresh prints; longer windows show
                moves that have had time to persist.
              </dd>
            </div>
          </dl>
        </section>

        <section className="mt-8 border-t border-[var(--line)] pt-4">
          <h2 className="lg-label">Fees</h2>
          <p className="mt-3">
            Leadgap does not add a fee. You pay Polymarket’s own trading, funding, and liquidation fees — the same as
            trading on polymarket.com.
          </p>
        </section>

        <section className="mt-8 border-t border-[var(--line)] pt-4">
          <h2 className="lg-label">Desk</h2>
          <p className="mt-3">
            The left pane is the same brief as the wire, plus a link to the event on Polymarket. Copper is Yes
            probability. Stone is the perp. Forest and brick are long and short only. Funding on the ticker is what
            longs pay shorts (or the reverse) on that asset.
          </p>
        </section>

        <section className="mt-8 border-t border-[var(--line)] pt-4">
          <h2 className="lg-label">Login</h2>
          <p className="mt-3">
            Log in to Polymarket through Privy — the same account model polymarket.com uses. Trading requires HTTPS and
            a supported location. Perps access is still gated on Polymarket’s side; request it at{" "}
            <a href={PERPS_WAITLIST_URL} target="_blank" rel="noreferrer" className="text-[var(--text)] hover:text-[var(--signal)]">
              polymarket.com/perps
            </a>
            .
          </p>
        </section>

        <section className="mt-8 border-t border-[var(--line)] pt-4">
          <h2 className="lg-label">Disclaimer</h2>
          <p className="mt-3">
            Not financial advice. Scores are a ranking of residual, not a forecast. Event odds can be wrong. Perps can
            gap. You can lose the margin you post.
          </p>
        </section>

        <p className="mt-8 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
          <Link href="/" className="text-[var(--signal)] hover:underline">
            Back to the wire
          </Link>
          <a href={APP_X} target="_blank" rel="noreferrer" className="hover:text-[var(--text)]">
            X
          </a>
          <a href={APP_GITHUB} target="_blank" rel="noreferrer" className="hover:text-[var(--text)]">
            GitHub
          </a>
        </p>
      </article>
    </PageShell>
  );
}
