import { AssetView } from "@/components/AssetView";

export default async function AssetPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  return <AssetView symbol={decodeURIComponent(symbol).toUpperCase()} />;
}
