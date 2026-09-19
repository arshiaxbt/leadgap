import type { Metadata } from "next";
import { SignalDetail } from "@/components/signal/SignalDetail";
import { signalWindow, signalShareMetadata } from "@/lib/signal-share";

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
