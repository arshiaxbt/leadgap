import type { Metadata } from "next";
import { Suspense } from "react";
import { TradeDesk } from "@/components/desk/TradeDesk";

// Reads search params below a Suspense boundary, which otherwise bails
// out of server rendering entirely and ships an empty page.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ symbol: string }>;
}): Promise<Metadata> {
  const { symbol } = await params;
  return { title: symbol.replace("-USD", "").toUpperCase() };
}

export default async function AssetPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Suspense
        fallback={<div className="m-4 h-64 animate-pulse bg-[var(--hover)]" />}
      >
        <TradeDesk key={symbol.toUpperCase()} symbol={symbol.toUpperCase()} />
      </Suspense>
    </div>
  );
}
