import type { Metadata } from "next";
import { EventView } from "@/components/signal/EventView";

// Reads search params below a Suspense boundary, which otherwise bails
// out of server rendering entirely and ships an empty page.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Event",
};

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const eventId = decodeURIComponent(id);
  return <EventView key={eventId} eventId={eventId} />;
}
