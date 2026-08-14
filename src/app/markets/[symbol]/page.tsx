import type { Metadata } from "next";
import { AssetView } from "@/components/AssetView";

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
  return <AssetView symbol={decodeURIComponent(symbol).toUpperCase()} />;
}
