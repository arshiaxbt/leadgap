import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TradeDesk } from "@/components/desk/TradeDesk";
import { aliasesForSymbol, marketSymbols } from "@/lib/mapping";
import { pageMetadata } from "@/lib/seo";
import { catalogShape } from "@/lib/store";

// Reads search params below a Suspense boundary, which otherwise bails
// out of server rendering entirely and ships an empty page.
export const dynamic = "force-dynamic";

const mapped = () => new Set(marketSymbols());

/**
 * Unknown tickers used to render an empty desk with a 200, so any invented
 * symbol was a crawlable page. A symbol the venue does not list and we do not
 * map is a real 404 — but only once the catalog has loaded, so a data outage
 * cannot 404 the whole site.
 */
async function resolveSymbol(raw: string): Promise<string> {
  const symbol = decodeURIComponent(raw).toUpperCase();
  if (mapped().has(symbol)) return symbol;
  const { instruments } = await catalogShape().catch(() => ({
    instruments: new Set<string>(),
    events: 0,
  }));
  if (instruments.size && !instruments.has(symbol)) notFound();
  return symbol;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  const sym = await resolveSymbol(symbol);
  const name = sym.replace("-USD", "");
  const isMapped = mapped().has(sym);
  const alias = aliasesForSymbol(sym)[0] ?? name;
  return pageMetadata({
    path: `/markets/${sym}`,
    title: name,
    description: isMapped
      ? `${alias} perpetual: live price, the Polymarket events mapped to it, and the gap between the move those odds imply and the move the perp made.`
      : `${alias} perpetual: live price, order book and funding.`,
    // Desks without an event mapping have prices but nothing to explain.
    index: isMapped,
  });
}

export default async function AssetPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  const sym = await resolveSymbol(symbol);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Suspense
        fallback={<div className="m-4 h-64 animate-pulse bg-[var(--hover)]" />}
      >
        <TradeDesk key={sym} symbol={sym} />
      </Suspense>
    </div>
  );
}
