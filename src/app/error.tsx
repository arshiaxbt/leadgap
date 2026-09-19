"use client";
import Link from "next/link";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="m-auto max-w-md p-8 text-center">
      <p className="kicker">Something went wrong</p>
      <h1 className="serif mt-3 text-[30px]">This view couldn’t load.</h1>
      <p className="mt-3 text-[13px] leading-[1.65] text-subtle">
        Try again to reconnect. If the problem continues, return to Signals.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <button
          onClick={reset}
          className="lg-focus h-9 rounded-[7px] bg-odds px-4 text-[13px] font-semibold text-on-odds"
        >
          Try again
        </button>
        <Link
          href="/"
          className="lg-focus inline-flex h-9 items-center rounded-[7px] border border-line-strong px-4 text-[13px] text-subtle hover:text-text"
        >
          Signals
        </Link>
      </div>
    </div>
  );
}
