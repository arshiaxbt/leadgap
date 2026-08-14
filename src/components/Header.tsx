"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LoginButton } from "@/components/LoginButton";
import { APP_LOGO, APP_NAME } from "@/lib/brand";

const LINKS = [
  { href: "/", label: "Gaps" },
  { href: "/markets", label: "Markets" },
];

export function Header() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-[#1e2636] bg-[#07080c]/80 backdrop-blur-md">
      <div className="flex h-14 w-full items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5 text-sm font-semibold tracking-tight text-white">
            <Image src={APP_LOGO} alt="" width={28} height={28} className="rounded-lg" />
            {APP_NAME}
          </Link>
          <nav className="flex gap-1 text-sm">
            {LINKS.map((link) => {
              const on = path === link.href || (link.href !== "/" && path.startsWith(link.href));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-md px-2.5 py-1 ${on ? "text-white" : "text-[#8b93a7] hover:text-white"}`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <LoginButton />
      </div>
    </header>
  );
}
