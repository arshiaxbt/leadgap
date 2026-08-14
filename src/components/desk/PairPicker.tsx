"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtCompact, fmtPct, fmtPx, signedClass } from "@/lib/format";
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
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<(typeof CATS)[number]["id"]>("all");
  const [tickers, setTickers] = useState<Record<string, PerpsTicker>>({});
  const [box, setBox] = useState({ top: 0, left: 0 });
  const [hi, setHi] = useState(0);

  useEffect(() => {
    fetch("/api/markets")
      .then((r) => r.json())
      .then((d: { tickers?: Record<string, PerpsTicker> }) => setTickers(d.tickers ?? {}))
      .catch(() => undefined);
  }, []);

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
    const width = 420;
    const left = Math.min(r.left, Math.max(8, window.innerWidth - width - 8));
    setBox({ top: r.bottom + 6, left });
    window.setTimeout(() => searchRef.current?.focus(), 0);
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
      .sort((a, b) => {
        if (a.symbol === instrument.symbol) return -1;
        if (b.symbol === instrument.symbol) return 1;
        const oa = tickers[a.symbol]?.openInterest ?? 0;
        const ob = tickers[b.symbol]?.openInterest ?? 0;
        return ob - oa;
      });
  }, [cat, instrument.symbol, instruments, q, tickers]);

  useEffect(() => {
    setHi(0);
  }, [q, cat, open]);

  const base = instrument.symbol.replace("-USD", "");

  function go(symbol: string) {
    setOpen(false);
    router.push(`/markets/${symbol}`);
  }

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
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="text-sm font-semibold tracking-wide text-white">{base}</span>
        <span className="text-[10px] text-[#5c6478]">Perp</span>
        <svg viewBox="0 0 12 12" className={`h-2 w-2 text-[#8b93a7] ${open ? "rotate-180" : ""}`} aria-hidden>
          <path fill="currentColor" d="M2.2 4.2 6 8l3.8-3.8-.9-.9L6 6.2 3.1 3.3z" />
        </svg>
      </button>
      {open ? (
        <div
          ref={panel}
          style={{ top: box.top, left: box.left }}
          className="fixed z-50 w-[420px] overflow-hidden rounded-lg border border-[#1e2636] bg-[#0c1018] shadow-[0_16px_40px_rgba(0,0,0,0.55)]"
        >
          <input
            ref={searchRef}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHi((n) => Math.min(rows.length - 1, n + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHi((n) => Math.max(0, n - 1));
              } else if (e.key === "Enter") {
                const row = rows[hi];
                if (row) go(row.symbol);
              }
            }}
            placeholder="Search markets"
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
          <div className="grid grid-cols-[1fr_88px_64px_56px] px-3 py-1 text-[9px] uppercase tracking-wide text-[#5c6478]">
            <span>Market</span>
            <span className="text-right">Mark</span>
            <span className="text-right">1h</span>
            <span className="text-right">OI</span>
          </div>
          <div className="max-h-[min(70vh,420px)] overflow-auto pb-1">
            {rows.length === 0 ? (
              <p className="px-3 py-3 text-[11px] text-[#5c6478]">No markets.</p>
            ) : (
              rows.map((item, i) => {
                const t = tickers[item.symbol];
                const ch = t?.change1h ?? null;
                const on = item.symbol === instrument.symbol;
                return (
                  <button
                    key={item.symbol}
                    type="button"
                    onMouseEnter={() => setHi(i)}
                    onClick={() => go(item.symbol)}
                    className={`grid w-full grid-cols-[1fr_88px_64px_56px] items-center px-3 py-1.5 text-left text-xs ${
                      on || i === hi ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate font-medium text-zinc-100">{item.symbol.replace("-USD", "")}</span>
                      <span className="shrink-0 text-[9px] uppercase text-[#5c6478]">{item.category}</span>
                    </span>
                    <span className="num text-right text-zinc-300">
                      {t ? fmtPx(t.markPrice, item.priceDecimals) : "—"}
                    </span>
                    <span className={`num text-right ${ch != null ? signedClass(ch) : "text-[#5c6478]"}`}>
                      {ch != null ? fmtPct(ch) : "—"}
                    </span>
                    <span className="num text-right text-[#8b93a7]">
                      {t ? fmtCompact(t.openInterest) : "—"}
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
