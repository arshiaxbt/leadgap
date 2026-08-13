import { EventView } from "@/components/EventView";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventView id={id} />;
}
