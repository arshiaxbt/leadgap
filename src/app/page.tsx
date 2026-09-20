import { Suspense } from "react";
import { OpportunityFeed } from "@/components/OpportunityFeed";
import { PageShell } from "@/components/PageShell";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  path: "/",
  absoluteTitle: "Leadgap — Polymarket event odds against perpetual moves",
  description:
    "Live comparison of Polymarket event probabilities with the perpetual futures they map to: the move the odds imply, the move the perp made, and the gap between them.",
});

// Reads search params below a Suspense boundary, which otherwise bails
// out of server rendering entirely and ships an empty page.
export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <PageShell full>
      <Suspense>
        <OpportunityFeed />
      </Suspense>
    </PageShell>
  );
}
