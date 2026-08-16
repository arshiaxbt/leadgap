"use client";

import { useEffect, useState } from "react";
import { shortAddr } from "@/lib/format";
import type { PublicProfile } from "@/lib/gamma";
import { safeHttpsUrl, safeXProfileUrl } from "@/lib/safe-url";

function profileHref(profile: PublicProfile): string {
  if (profile.displayUsernamePublic && profile.name) {
    return `https://polymarket.com/@${encodeURIComponent(profile.name)}`;
  }
  const wallet = profile.proxyWallet;
  return wallet ? `https://polymarket.com/profile/${wallet}` : "https://polymarket.com";
}

function displayName(profile: PublicProfile, fallback?: string): string {
  if (profile.displayUsernamePublic && profile.name) return profile.name;
  if (profile.pseudonym) return profile.pseudonym;
  if (profile.name) return profile.name;
  if (fallback) return shortAddr(fallback);
  if (profile.proxyWallet) return shortAddr(profile.proxyWallet);
  return "Polymarket";
}

export function usePolyProfile(addresses: (string | undefined)[]) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const key = addresses.filter(Boolean).join(",");

  useEffect(() => {
    if (!key) {
      setProfile(null);
      return;
    }
    let stop = false;
    const params = new URLSearchParams();
    for (const addr of key.split(",")) params.append("address", addr);
    fetch(`/api/profile?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json: PublicProfile | null) => {
        if (!stop) setProfile(json);
      })
      .catch(() => {
        if (!stop) setProfile(null);
      });
    return () => {
      stop = true;
    };
  }, [key]);

  return profile;
}

export function PolyProfileChip({
  address,
  fallback,
}: {
  address?: string;
  fallback?: string;
}) {
  const profile = usePolyProfile([address]);
  const label = profile ? displayName(profile, address ?? fallback) : (fallback ?? (address ? shortAddr(address) : "Signed in"));
  const href = profile ? profileHref(profile) : address ? `https://polymarket.com/profile/${address}` : undefined;
  const image = safeHttpsUrl(profile?.profileImage);

  const inner = (
    <span className="flex items-center gap-1.5">
      {image ? (
        <img src={image} alt="" width={18} height={18} className="h-[18px] w-[18px] rounded-full object-cover" />
      ) : (
        <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-[var(--elevated)] text-[9px] text-[var(--muted)]">
          {(label[0] ?? "?").toUpperCase()}
        </span>
      )}
      <span className="max-w-[120px] truncate text-[12px] text-[var(--text)]">{label}</span>
    </span>
  );

  if (!href) return inner;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="hover:opacity-80" title="Polymarket profile">
      {inner}
    </a>
  );
}

export function CopyAddr({ addr, label }: { addr: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(addr);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      }}
      className="font-mono text-[12px] text-[var(--text)] hover:text-[var(--signal)]"
      title={addr}
    >
      {copied ? "Copied" : `${label ? `${label} ` : ""}${shortAddr(addr)}`}
    </button>
  );
}

export function PolyProfileCard({
  eoa,
  polymarketWallet,
}: {
  eoa?: string;
  polymarketWallet?: string;
}) {
  const profile = usePolyProfile([polymarketWallet, eoa]);
  const name = profile ? displayName(profile, polymarketWallet ?? eoa) : null;
  const href = profile ? profileHref(profile) : polymarketWallet ? `https://polymarket.com/profile/${polymarketWallet}` : undefined;
  const wallet = profile?.proxyWallet ?? polymarketWallet;
  const image = safeHttpsUrl(profile?.profileImage);
  const xHref = safeXProfileUrl(profile?.xUsername);

  if (!eoa && !polymarketWallet) return null;

  return (
    <div className="lg-pane flex flex-wrap items-center gap-3 px-4 py-3">
      {image ? (
        <img src={image} alt="" width={40} height={40} className="h-10 w-10 rounded-full object-cover" />
      ) : (
        <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--elevated)] text-sm text-[var(--muted)]">
          {(name?.[0] ?? "?").toUpperCase()}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {href && name ? (
            <a href={href} target="_blank" rel="noreferrer" className="text-sm font-medium text-[var(--text)] hover:underline">
              {name}
            </a>
          ) : (
            <span className="text-sm font-medium text-[var(--text)]">{name ?? "Polymarket account"}</span>
          )}
          {profile?.verifiedBadge ? <span className="text-[10px] text-[var(--signal)]">Verified</span> : null}
          {xHref ? (
            <a
              href={xHref}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-[var(--muted)] hover:text-[var(--text)]"
            >
              @{profile?.xUsername}
            </a>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--muted)]">
          {wallet ? (
            <span>
              Polymarket <CopyAddr addr={wallet} />
            </span>
          ) : null}
          {eoa && eoa.toLowerCase() !== wallet?.toLowerCase() ? (
            <span>
              Signer <CopyAddr addr={eoa} />
            </span>
          ) : null}
        </div>
      </div>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="text-[11px] text-[var(--signal)] hover:underline">
          View on Polymarket
        </a>
      ) : null}
    </div>
  );
}
