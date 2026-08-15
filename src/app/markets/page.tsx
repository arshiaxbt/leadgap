import type { Metadata } from "next";
import { MarketsBoard } from "@/components/MarketsBoard";
import { PageShell } from "@/components/PageShell";

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
