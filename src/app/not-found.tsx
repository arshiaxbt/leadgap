import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-start gap-3 py-16">
      <p className="text-sm text-[#8b93a7]">404</p>
      <h1 className="text-2xl font-semibold text-white">That page is not here.</h1>
      <Link href="/" className="text-sm text-[#3ee0a8] hover:underline">
        Back to gaps
      </Link>
    </div>
  );
}
