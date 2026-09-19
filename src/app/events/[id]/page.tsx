import type { Metadata } from "next";
import { EventView } from "@/components/signal/EventView";

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
