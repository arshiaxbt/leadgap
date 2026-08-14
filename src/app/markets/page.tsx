import type { Metadata } from "next";
import { MarketsBoard } from "@/components/MarketsBoard";

export const metadata: Metadata = {
  title: "Markets",
};

export default function MarketsPage() {
  return <MarketsBoard />;
}
