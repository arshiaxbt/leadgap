import { EventView } from "@/components/signal/EventView";
import { pageMetadata } from "@/lib/seo";
import { getEvent } from "@/lib/store";

// Reads search params below a Suspense boundary, which otherwise bails
// out of server rendering entirely and ships an empty page.
export const dynamic = "force-dynamic";

/**
 * Deliberately no 404 for a missing event. Events rotate out constantly, and
 * a link someone shared should still explain itself rather than dying; the
 * page carries noindex, so a resolved event cannot clutter the index either.
 */
async function lookup(id: string) {
  return getEvent(id).catch(() => null);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const eventId = decodeURIComponent(id);
  const event = await lookup(eventId);
  const question = event?.event?.question || event?.event?.title;
  return pageMetadata({
    path: `/events/${eventId}`,
    title: question ? question.slice(0, 70) : "Event",
    description: question
      ? `Every perpetual mapped to “${question.slice(0, 90)}”, ranked by the gap between the move its odds imply and the move the perp made.`
      : "Every perpetual mapped to this Polymarket event, ranked by gap.",
    // One event, rewritten by the minute and gone when it resolves.
    index: false,
  });
}

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const eventId = decodeURIComponent(id);
  await lookup(eventId);
  return <EventView key={eventId} eventId={eventId} />;
}
