import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Watchlist } from "@/components/Watchlist";

export const metadata: Metadata = pageMetadata({
  path: "/watchlist",
  title: "Watchlist",
  description:
    "Signals you are tracking and the alerts that fire when a gap moves.",
  // Personal, and empty for anyone not signed in.
  index: false,
});

export default function WatchlistPage() {
  return <Watchlist />;
}
