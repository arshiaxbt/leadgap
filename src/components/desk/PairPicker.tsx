"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtPct, fmtPx, signedClass } from "@/lib/format";
import type { PerpsInstrument, PerpsTicker } from "@/lib/types";

const CATS = [
  { id: "all", label: "All" },
  { id: "crypto", label: "Crypto" },
  { id: "equity", label: "Equity" },
  { id: "commodity", label: "Commodity" },
  { id: "index", label: "Index" },
] as const;

export function PairPicker({
  instrument,
  instruments,
}: {
  instrument: PerpsInstrument;
  instruments: PerpsInstrument[];
}) {
  const router = useRouter();
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<(typeof CATS)[number]["id"]>("all");
  const [tickers, setTickers] = useState<Record<string, PerpsTicker>>({});
  const [box, setBox] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    fetch("/api/markets")
      .then((r) => r.json())
      .then((d: { tickers?: Record<string, PerpsTicker> }) => setTickers(d.tickers ?? {}))
      .catch(() => undefined);
  }, [open]);

  useEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    setBox({ top: r.bottom + 6, left: r.left });
  }, [open]);

  useEffect(() => {
    function onDoc(ev: MouseEvent) {
      const t = ev.target as Node;
      if (btn.current?.contains(t) || panel.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return instruments
      .filter((item) => (cat === "all" ? true : item.category === cat))
      .filter((item) => {
        if (!needle) return true;
        return `${item.symbol} ${item.baseAsset} ${item.category}`.toLowerCase().includes(needle);
      })
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [cat, instruments, q]);

  const base = instrument.symbol.replace("-USD", "");

  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setQ("");
          setCat("all");
        }}
        className="flex h-8 items-center gap-1.5 rounded px-1.5 hover:bg-white/[0.04]"
      >
        <span className="text-sm font-semibold tracking-wide text-white">{base}</span>
        <svg viewBox="0 0 12 12" className={`h-2 w-2 text-[#8b93a7] ${open ? "rotate-180" : ""}`} aria-hidden>
          <path fill="currentColor" d="M2.2 4.2 6 8l3.8-3.8-.9-.9L6 6.2 3.1 3.3z" />
        </svg>
      </button>
      {open ? (
        <div
          ref={panel}
          style={{ top: box.top, left: box.left }}
          className="fixed z-50 w-[280px] overflow-hidden rounded-lg border border-[#1e2636] bg-[#0c1018] shadow-[0_16px_40px_rgba(0,0,0,0.5)]"
        >
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            className="w-full border-b border-[#1e2636] bg-transparent px-3 py-2 text-xs text-zinc-100 outline-none placeholder:text-[#5c6478]"
          />
          <div className="flex gap-1 overflow-x-auto border-b border-[#1e2636] px-2 py-1.5">
            {CATS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCat(c.id)}
                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
                  cat === c.id ? "bg-white/10 text-white" : "text-[#8b93a7] hover:text-white"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="max-h-64 overflow-auto py-1">
            {rows.length === 0 ? (
              <p className="px-3 py-3 text-[11px] text-[#5c6478]">No markets.</p>
            ) : (
              rows.map((item) => {
                const t = tickers[item.symbol];
                const ch = t?.change1h ?? null;
                const on = item.symbol === instrument.symbol;
                return (
                  <button
                    key={item.symbol}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      router.push(`/markets/${item.symbol}`);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-1 text-left text-xs hover:bg-white/[0.04] ${
                      on ? "bg-white/[0.06]" : ""
                    }`}
                  >
                    <span className="w-14 font-medium text-zinc-100">{item.symbol.replace("-USD", "")}</span>
                    <span className="num flex-1 text-right text-zinc-300">
                      {t ? fmtPx(t.markPrice, item.priceDecimals) : "—"}
                    </span>
                    <span className={`num w-12 text-right ${ch != null ? signedClass(ch) : "text-[#5c6478]"}`}>
                      {ch != null ? fmtPct(ch) : "—"}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
