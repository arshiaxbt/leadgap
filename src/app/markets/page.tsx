import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { MarketsBoard } from "@/components/MarketsBoard";
import { PageShell } from "@/components/PageShell";

// Regenerated in the background so the CDN keeps serving it.
export const revalidate = 60;

export const metadata: Metadata = pageMetadata({
  path: "/markets",
  title: "Markets",
  description:
    "Every perpetual Leadgap tracks, ranked by how many live Polymarket signals are riding on it.",
});

export default function MarketsPage() {
  return (
    <PageShell full>
      <MarketsBoard />
    </PageShell>
  );
}
