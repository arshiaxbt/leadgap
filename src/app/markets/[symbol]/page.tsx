import type { Metadata } from "next";
import { Suspense } from "react";
import { TradeDesk } from "@/components/desk/TradeDesk";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ symbol: string }>;
}): Promise<Metadata> {
  const { symbol } = await params;
  return { title: decodeURIComponent(symbol).replace("-USD", "").toUpperCase() };
}

export default async function AssetPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Suspense fallback={<div className="m-4 h-64 animate-pulse bg-[var(--hover)]" />}>
        <TradeDesk symbol={decodeURIComponent(symbol).toUpperCase()} />
      </Suspense>
    </div>
  );
}
