import type { Metadata } from "next";
import { SignalDetail } from "@/components/signal/SignalDetail";
import { signalWindow, signalShareMetadata } from "@/lib/signal-share";

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
  return signalShareMetadata(await params, (await searchParams).window);
}

export default async function SignalPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ window?: string | string[] }>;
}) {
  const { event, symbol } = await params;
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
