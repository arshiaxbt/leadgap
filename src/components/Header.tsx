"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LoginButton } from "@/components/LoginButton";
import { APP_LOGO, APP_NAME } from "@/lib/brand";

const LINKS = [
  { href: "/", label: "Opportunities" },
  { href: "/markets", label: "All Perps" },
];

export function Header() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-800 bg-[#0b0d10]/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight text-zinc-100">
            <img src={APP_LOGO} alt="" width={28} height={28} className="rounded-md" />
            {APP_NAME}
          </Link>
          <nav className="flex gap-4 text-sm">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={
                  path === link.href ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-200"
                }
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <LoginButton />
      </div>
    </header>
  );
}
