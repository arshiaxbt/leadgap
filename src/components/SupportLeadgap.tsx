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
            className="lg-focus inline-flex min-h-10 items-center gap-2 rounded-[7px] bg-odds px-4 text-[13px] font-semibold text-on-odds"
          >
            Open Polymarket <ArrowUpRight size={16} />
          </a>
          <button
            onClick={() => void copy()}
            className="lg-focus inline-flex min-h-10 items-center gap-2 rounded-[7px] border border-line-strong px-4 text-[13px] text-subtle hover:text-text"
          >
            {message.startsWith("Referral") ? (
              <Check size={16} />
            ) : (
              <Copy size={16} />
            )}
            Copy referral link
          </button>
        </div>
        <p className="num mt-3 break-all text-[12px] text-dim">{POLYMARKET_REFERRAL_URL}</p>
        <p role="status" className="mt-2 text-[13px] text-subtle">
          {message}
        </p>
        <a
          href="https://help.polymarket.com/en/articles/14174498-referral-program"
          target="_blank"
          rel="noopener noreferrer"
          className="lg-focus mt-3 inline-block text-[13px] text-subtle underline underline-offset-2 hover:text-text"
        >
          Polymarket referral terms
        </a>
      </div>
    </section>
  );
}
