import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { PageShell } from "@/components/PageShell";
import { PortfolioDesk } from "@/components/PortfolioDesk";

export const metadata: Metadata = pageMetadata({
  path: "/portfolio",
  title: "Portfolio",
  description: "Your Polymarket perpetual positions, orders and fills.",
  // Account-only: nothing here for a signed-out visitor.
  index: false,
});

export default function PortfolioPage() {
  return (
    <PageShell full>
      <PortfolioDesk />
    </PageShell>
  );
}
