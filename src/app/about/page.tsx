import type { Metadata } from "next";
import Link from "next/link";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/DataTable";
import { GapMeter } from "@/components/GapMeter";
import { LogoMark } from "@/components/LogoMark";
import { OddsFigure } from "@/components/OddsFigure";
import { PageShell } from "@/components/PageShell";
import { SocialLinks } from "@/components/SocialLinks";
import { buttonVariants } from "@/components/ui/button";
import { APP_NAME, APP_TAGLINE, PERPS_WAITLIST_URL } from "@/lib/brand";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "About",
  description: APP_TAGLINE,
};

export default function AboutPage() {
  return (
    <PageShell>
      <article className="mx-auto max-w-[640px] py-8 text-[14px] leading-6 text-[var(--muted)]">
        <div className="flex items-center gap-3">
          <LogoMark className="h-8 w-8 shrink-0" />
          <h1 className="text-[22px] font-medium leading-7 text-[var(--text)]">{APP_NAME}</h1>
        </div>
        <p className="mt-2 text-[15px] text-[var(--text)]">{APP_TAGLINE}</p>

        <section className="mt-8">
          <h2 className="text-[15px] font-medium text-[var(--text)]">1. Discover a setup</h2>
          <p className="mt-2">
            Signals ranks Polymarket events whose Yes odds moved before the mapped perpetual. Tradeable means the residual
            is large enough to act. Watching is odds-led but not yet a trade. All includes in-line and perp-led prints for
            context.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-[15px] font-medium text-[var(--text)]">2. Read Yes, gap, expected vs actual</h2>
          <p className="mt-2">
            Yes is ice. The perp is stone. Expected is what the odds move implied for the mark. Actual is what the mark did.
            The empty band between them is the gap.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <OddsFigure yes={0.645} delta={0.03} />
            <span className="text-[12px] text-[var(--dim)]">WTIOIL</span>
          </div>
          <GapMeter className="mt-3" expected={-0.045} actual={0.0001} />
          <div className="mt-3">
            <DataTable>
              <DataTableHeader>
                <tr>
                  <DataTableHead>Event</DataTableHead>
                  <DataTableHead align="right">Yes</DataTableHead>
                  <DataTableHead align="right">Gap</DataTableHead>
                </tr>
              </DataTableHeader>
              <DataTableBody>
                <DataTableRow selected>
                  <DataTableCell>What will WTI Crude Oil hit in August 2026?</DataTableCell>
                  <DataTableCell numeric>
                    <OddsFigure yes={0.645} delta={0.03} size="sm" />
                  </DataTableCell>
                  <DataTableCell>
                    <GapMeter dense expected={-0.045} actual={0.0001} className="ml-auto" />
                  </DataTableCell>
                </DataTableRow>
              </DataTableBody>
            </DataTable>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link href="/markets/WTIOIL-USD" className={cn(buttonVariants({ variant: "long", size: "sm" }), "h-10")}>
              Long WTIOIL
            </Link>
            <Link
              href="/markets/WTIOIL-USD"
              className={cn(buttonVariants({ variant: "short", size: "sm" }), "h-10 opacity-40")}
            >
              Short WTIOIL
            </Link>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-[15px] font-medium text-[var(--text)]">3. Trade the mapped perp</h2>
          <p className="mt-2">
            Open a row to load Trade with the event attached. You long or short the perpetual on Leadgap — not the event
            share — with the same Polymarket account. Markets is the full instrument table if you want the book without a
            setup.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-[15px] font-medium text-[var(--text)]">4. Fees</h2>
          <p className="mt-2">
            Leadgap adds none. You pay Polymarket’s trading, funding, and liquidation fees — the same as trading on
            polymarket.com.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-[15px] font-medium text-[var(--text)]">5. Login, HTTPS, geo, waitlist</h2>
          <p className="mt-2">
            Log in to Polymarket through Privy — the same account model polymarket.com uses. Trading requires HTTPS and a
            supported location. Perps access is still gated on Polymarket’s side; request it at{" "}
            <a href={PERPS_WAITLIST_URL} target="_blank" rel="noreferrer" className="text-[var(--text)] hover:underline">
              polymarket.com/perps
            </a>
            .
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-[15px] font-medium text-[var(--text)]">6. Disclaimer</h2>
          <p className="mt-2">
            Not financial advice. Scores are a ranking of residual, not a forecast. Event odds can be wrong. Perps can gap.
            You can lose the margin you post.
          </p>
        </section>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4 text-[13px]">
          <Link href="/" className="lg-focus text-[var(--text)] hover:underline">
            Signals
          </Link>
          <SocialLinks />
        </footer>
      </article>
    </PageShell>
  );
}
