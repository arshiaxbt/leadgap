import Link from "next/link";
import { PageShell } from "@/components/PageShell";

export default function NotFound() {
  return (
    <PageShell>
      <div className="flex flex-col items-start gap-3 py-16">
        <p className="text-sm text-[var(--muted)]">404</p>
        <h1 className="event-title text-2xl italic text-[var(--text)]">That page is not here.</h1>
        <Link href="/" className="text-sm text-[var(--signal)] hover:underline">
          Back to the wire
        </Link>
      </div>
    </PageShell>
  );
}
