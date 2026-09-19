import type { Metadata } from "next";
import { Watchlist } from "@/components/Watchlist";

export const metadata: Metadata = {
  title: "Watchlist",
};

export default function WatchlistPage() {
  return <Watchlist />;
}
