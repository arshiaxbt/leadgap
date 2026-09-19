import type { Metadata } from "next";
import { SignalDetail } from "@/components/signal/SignalDetail";
import { GAP_WINDOWS } from "@/lib/divergence";
import type { GapWindow } from "@/lib/types";

type Params = Promise<{ event: string; symbol: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { event, symbol } = await params;
  const name = decodeURIComponent(symbol).replace("-USD", "").toUpperCase();
  const title = `${name} signal`;
  const description = `Polymarket odds against the ${name} perp, and the gap between them.`;
  // Share images come from the colocated opengraph-image and twitter-image routes.
  return {
    title,
    description,
    openGraph: {
      title: `${title} · Leadgap`,
      description,
      url: `/signals/${event}/${symbol}`,
      siteName: "Leadgap",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} · Leadgap`,
      description,
    },
  };
}

export default async function SignalPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ window?: string }>;
}) {
  const { event, symbol } = await params;
  const { window } = await searchParams;
  const initial = GAP_WINDOWS.includes(window as GapWindow)
    ? (window as GapWindow)
    : "4h";
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
