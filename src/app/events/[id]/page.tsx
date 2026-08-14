import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { getEvent } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Event",
};

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getEvent(id);
  const symbol = data?.event.perps[0]?.symbol;
  if (!data || !symbol) {
    return (
      <PageShell>
        <p className="py-16 text-sm text-[#8b93a7]">Event not found or not ingested yet.</p>
      </PageShell>
    );
  }
  redirect(`/markets/${encodeURIComponent(symbol)}?event=${encodeURIComponent(data.event.id)}`);
}
