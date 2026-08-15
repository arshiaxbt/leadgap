import { OpportunityFeed } from "@/components/OpportunityFeed";
import { PageShell } from "@/components/PageShell";

export default function HomePage() {
  return (
    <PageShell full>
      <OpportunityFeed />
    </PageShell>
  );
}
