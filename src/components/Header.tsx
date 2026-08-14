"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LoginButton } from "@/components/LoginButton";
import { PortfolioStrip } from "@/components/PortfolioStrip";
import { APP_LOGO, APP_NAME } from "@/lib/brand";

const LINKS = [
  { href: "/", label: "Gaps" },
  { href: "/markets", label: "Markets" },
  { href: "/portfolio", label: "Portfolio" },
];

export function Header() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-[#1a2030] bg-[#08090c]">
      <div className="flex h-10 w-full items-center gap-5 px-3">
        <Link href="/" className="flex items-center gap-2 text-[13px] font-semibold tracking-tight text-white">
          <Image src={APP_LOGO} alt="" width={20} height={20} className="rounded" />
          {APP_NAME}
        </Link>
        <nav className="flex gap-0.5 text-[12px]">
          {LINKS.map((link) => {
            const on = path === link.href || (link.href !== "/" && path.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded px-2 py-1 ${on ? "text-white" : "text-[#7d8699] hover:text-white"}`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <PortfolioStrip />
          <LoginButton />
        </div>
      </div>
    </header>
  );
}
