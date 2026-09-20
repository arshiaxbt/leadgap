import type { Metadata } from "next";
import { MarketsBoard } from "@/components/MarketsBoard";
import { PageShell } from "@/components/PageShell";

// Regenerated in the background so the CDN keeps serving it.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Markets",
};

export default function MarketsPage() {
  return (
    <PageShell full>
      <MarketsBoard />
    </PageShell>
  );
}
