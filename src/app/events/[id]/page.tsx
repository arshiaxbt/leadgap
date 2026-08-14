import type { Metadata } from "next";
import { EventView } from "@/components/EventView";

export const metadata: Metadata = {
  title: "Event",
};

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventView id={id} />;
}
