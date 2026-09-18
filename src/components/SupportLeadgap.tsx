"use client";
import { useState } from "react";
import { ArrowUpRight, Copy, Check } from "lucide-react";
import { POLYMARKET_REFERRAL_URL } from "@/lib/brand";
import { trackEvent } from "@/lib/track";
export function SupportLeadgap() {
  const [message, setMessage] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(POLYMARKET_REFERRAL_URL);
      setMessage("Referral link copied.");
      trackEvent("referral_copy", { placement: "guide" });
    } catch {
      setMessage("Could not copy. Select and copy the link below.");
    }
  }
  return (
    <section id="support" className="guide-section scroll-mt-4">
      <h2>Support Leadgap</h2>
      <div>
        <p>
          Using our Polymarket referral link may earn Leadgap referral rewards
          when you meet Polymarket’s eligibility requirements.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a
            href={POLYMARKET_REFERRAL_URL}
            target="_blank"
            rel="sponsored noopener noreferrer"
            className="lg-focus inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--text)] px-4 text-sm text-[var(--bg)]"
          >
            Open Polymarket <ArrowUpRight size={16} />
          </a>
          <button
            onClick={() => void copy()}
            className="lg-focus inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--line-strong)] px-4 text-sm"
          >
            {message.startsWith("Referral") ? (
              <Check size={16} />
            ) : (
              <Copy size={16} />
            )}
            Copy referral link
          </button>
        </div>
        <p className="mt-3 break-all text-sm">{POLYMARKET_REFERRAL_URL}</p>
        <p role="status" className="mt-2 text-sm">
          {message}
        </p>
        <a
          href="https://help.polymarket.com/en/articles/14174498-referral-program"
          target="_blank"
          rel="noopener noreferrer"
          className="lg-focus mt-3 inline-block text-sm underline"
        >
          Polymarket referral terms
        </a>
      </div>
    </section>
  );
}
