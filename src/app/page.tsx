import { Suspense } from "react";
import { OpportunityFeed } from "@/components/OpportunityFeed";
import { PageShell } from "@/components/PageShell";

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
