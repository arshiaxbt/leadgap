import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto flex max-w-xl flex-col items-start gap-3 px-6 py-20">
        <p className="kicker">404</p>
        <h1 className="serif text-[36px] leading-[1.15]">That page is not here.</h1>
        <p className="text-[13px] text-subtle">
          The link may be old, or the signal has resolved.
        </p>
        <Link href="/" className="lg-focus mt-2 text-[14px] text-odds hover:underline">
          Back to Signals →
        </Link>
      </div>
    </div>
  );
}
