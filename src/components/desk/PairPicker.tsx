"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtPct, fmtPx, signedClass } from "@/lib/format";
import type { PerpsInstrument, PerpsTicker } from "@/lib/types";

const CAT_ORDER = ["crypto", "commodity", "index", "equity"];

export function PairPicker({
  instrument,
  instruments,
}: {
  instrument: PerpsInstrument;
  instruments: PerpsInstrument[];
}) {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [tickers, setTickers] = useState<Record<string, PerpsTicker>>({});

  useEffect(() => {
    if (!open) return;
    fetch("/api/markets")
      .then((r) => r.json())
      .then((d: { tickers?: Record<string, PerpsTicker> }) => setTickers(d.tickers ?? {}))
      .catch(() => undefined);
  }, [open]);

  useEffect(() => {
    function onDoc(ev: MouseEvent) {
      if (!root.current?.contains(ev.target as Node)) setOpen(false);
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

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = instruments
      .filter((item) => {
        if (!needle) return true;
        return `${item.symbol} ${item.baseAsset} ${item.category}`.toLowerCase().includes(needle);
      })
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
    const byCat = new Map<string, PerpsInstrument[]>();
    for (const item of rows) {
      const cat = item.category || "other";
      byCat.set(cat, [...(byCat.get(cat) ?? []), item]);
    }
    return [...byCat.entries()].sort(([a], [b]) => {
      const ia = CAT_ORDER.indexOf(a);
      const ib = CAT_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [instruments, q]);

  const base = instrument.symbol.replace("-USD", "");

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setQ("");
        }}
        className="flex h-9 items-center gap-2 rounded-md border border-[#1e2636] bg-[#12161f] px-2.5 hover:border-[#2a3347]"
      >
        <span className="text-[15px] font-semibold tracking-wide text-white">{base}</span>
        <span className="text-[11px] text-[#5c6478]">/{instrument.quoteAsset || "USD"}</span>
        <svg
          viewBox="0 0 12 12"
          className={`ml-1 h-2.5 w-2.5 text-[#8b93a7] ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path fill="currentColor" d="M2.2 4.2 6 8l3.8-3.8-.9-.9L6 6.2 3.1 3.3z" />
        </svg>
      </button>
      {open ? (
        <div className="absolute left-0 top-[calc(100%+6px)] z-40 w-[340px] overflow-hidden rounded-lg border border-[#1e2636] bg-[#0c1018] shadow-[0_16px_40px_rgba(0,0,0,0.45)]">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search perps"
            className="w-full border-b border-[#1e2636] bg-transparent px-3 py-2.5 text-sm text-zinc-100 outline-none placeholder:text-[#5c6478]"
          />
          <div className="max-h-80 overflow-auto py-1">
            {groups.length === 0 ? (
              <p className="px-3 py-4 text-xs text-[#5c6478]">No markets match.</p>
            ) : (
              groups.map(([cat, rows]) => (
                <div key={cat}>
                  <p className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-[#5c6478]">
                    {cat}
                  </p>
                  {rows.map((item) => {
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
                        className={`flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm hover:bg-white/[0.04] ${
                          on ? "bg-white/[0.06]" : ""
                        }`}
                      >
                        <span className="w-[4.5rem] font-medium text-zinc-100">
                          {item.symbol.replace("-USD", "")}
                        </span>
                        <span className="num flex-1 text-right text-zinc-300">
                          {t ? fmtPx(t.markPrice, item.priceDecimals) : "—"}
                        </span>
                        <span
                          className={`num w-14 text-right text-[11px] ${
                            ch != null ? signedClass(ch) : "text-[#5c6478]"
                          }`}
                        >
                          {ch != null ? fmtPct(ch) : "—"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
