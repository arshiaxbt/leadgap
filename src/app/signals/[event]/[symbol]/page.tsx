import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SignalDetail } from "@/components/signal/SignalDetail";
import { marketSymbols } from "@/lib/mapping";
import { signalWindow, signalShareMetadata } from "@/lib/signal-share";
import { catalogShape } from "@/lib/store";

/**
 * Only an impossible perp is a 404 here. A signal whose event has resolved
 * still renders its own explanation, because shared links and their cards
 * outlive the event.
 */
async function assertSymbol(raw: string): Promise<void> {
  const symbol = decodeURIComponent(raw).toUpperCase();
  if (new Set(marketSymbols()).has(symbol)) return;
  const { instruments } = await catalogShape().catch(() => ({
    instruments: new Set<string>(),
    events: 0,
  }));
  if (instruments.size && !instruments.has(symbol)) notFound();
}

// Reads search params below a Suspense boundary, which otherwise bails
// out of server rendering entirely and ships an empty page.
export const dynamic = "force-dynamic";

type Params = Promise<{ event: string; symbol: string }>;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ window?: string | string[] }>;
}): Promise<Metadata> {
  const resolved = await params;
  // Checked here rather than in the page: metadata resolves before the
  // response starts streaming, so an unknown perp can still answer 404.
  await assertSymbol(resolved.symbol);
  return signalShareMetadata(resolved, (await searchParams).window);
}

export default async function SignalPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ window?: string | string[] }>;
}) {
  const { event, symbol } = await params;
  await assertSymbol(symbol);
  const { window } = await searchParams;
  const initial = signalWindow(window);
  const sym = decodeURIComponent(symbol).toUpperCase();
  return (
    <SignalDetail
      key={`${event}:${sym}`}
      eventId={decodeURIComponent(event)}
      symbol={sym}
      initialWindow={initial}
    />
  );
}
