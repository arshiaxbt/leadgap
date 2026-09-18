"use client";
import Link from "next/link";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="m-auto max-w-md p-8">
      <h1 className="text-2xl font-medium">This view couldn’t load.</h1>
      <p className="mt-3 leading-6 text-[var(--muted)]">
        Try again to reconnect. If the problem continues, return to Signals.
      </p>
      <button
        onClick={reset}
        className="lg-focus mt-6 rounded-md border border-[var(--line-strong)] px-4 py-2"
      >
        Try again
      </button>
      <Link href="/" className="ml-5 underline">
        Signals
      </Link>
    </div>
  );
}
