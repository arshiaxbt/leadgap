import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { PortfolioDesk } from "@/components/PortfolioDesk";

export const metadata: Metadata = {
  title: "Portfolio",
};

export default function PortfolioPage() {
  return (
    <PageShell>
      <PortfolioDesk />
    </PageShell>
  );
}
