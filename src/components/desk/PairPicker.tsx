"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtCompact, fmtFunding, fmtPct, fmtPx, signedClass } from "@/lib/format";
import type { PerpsInstrument, PerpsTicker } from "@/lib/types";

const CATS = [
  { id: "all", label: "All" },
  { id: "crypto", label: "Crypto" },
  { id: "equity", label: "Equity" },
  { id: "commodity", label: "Commodity" },
  { id: "index", label: "Index" },
] as const;

type SortCol = "name" | "mark" | "change" | "funding" | "oi";
type SortDir = "asc" | "desc";

const COLS = "grid-cols-[minmax(0,1fr)_72px_52px_80px_48px]";

function sortValue(item: PerpsInstrument, col: SortCol, tickers: Record<string, PerpsTicker>): number | string {
  const t = tickers[item.symbol];
  switch (col) {
    case "name":
      return item.symbol;
    case "mark":
      return t?.markPrice ?? 0;
    case "change":
      return t?.change1h ?? 0;
    case "funding":
      return t?.fundingRate ?? 0;
    case "oi":
      return t?.openInterest ?? 0;
    default: {
      const _never: never = col;
      return _never;
    }
  }
}

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
  const [box, setBox] = useState({ top: 0, left: 0, width: 520 });
  const [hi, setHi] = useState(0);
  const [sort, setSort] = useState<SortCol>("oi");
  const [dir, setDir] = useState<SortDir>("desc");

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
    const width = Math.min(540, window.innerWidth - 16);
    const left = Math.min(r.left, Math.max(8, window.innerWidth - width - 8));
    setBox({ top: r.bottom + 6, left, width });
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
        const va = sortValue(a, sort, tickers);
        const vb = sortValue(b, sort, tickers);
        const cmp =
          typeof va === "string" && typeof vb === "string" ? va.localeCompare(vb) : Number(va) - Number(vb);
        if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
        return a.symbol.localeCompare(b.symbol);
      });
  }, [cat, dir, instruments, q, sort, tickers]);

  useEffect(() => {
    setHi(0);
  }, [q, cat, open, sort, dir]);

  const base = instrument.symbol.replace("-USD", "");

  function go(symbol: string) {
    setOpen(false);
    router.push(`/markets/${symbol}`);
  }

  function onSort(col: SortCol) {
    if (sort === col) {
      setDir((d) => (d === "desc" ? "asc" : "desc"));
      return;
    }
    setSort(col);
    setDir(col === "name" ? "asc" : "desc");
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
        className="flex h-8 items-center gap-1.5 px-1.5 hover:bg-[var(--hover)]"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="text-sm font-semibold tracking-wide text-[var(--text)]">{base}</span>
        <span className="text-[10px] text-[var(--dim)]">Perp</span>
        <svg viewBox="0 0 12 12" className={`h-2 w-2 text-[var(--muted)] ${open ? "rotate-180" : ""}`} aria-hidden>
          <path fill="currentColor" d="M2.2 4.2 6 8l3.8-3.8-.9-.9L6 6.2 3.1 3.3z" />
        </svg>
      </button>
      {open ? (
        <div
          ref={panel}
          style={{ top: box.top, left: box.left, width: box.width }}
          className="fixed z-50 overflow-hidden border border-[var(--line)] bg-[var(--elevated)]"
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
            className="w-full border-b border-[var(--line)] bg-transparent px-3 py-2 text-xs text-[var(--text)] outline-none placeholder:text-[var(--dim)]"
          />
          <div className="flex gap-1 overflow-x-auto border-b border-[var(--line)] px-2 py-1.5">
            {CATS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCat(c.id)}
                className={`shrink-0 px-1.5 py-0.5 text-[10px] ${
                  cat === c.id ? "bg-[var(--hover)] text-[var(--text)]" : "text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className={`grid ${COLS} px-3 py-1 text-[9px] uppercase tracking-[0.1em]`}>
            <Head id="name" label="Market" align="left" sort={sort} dir={dir} onSort={onSort} />
            <Head id="mark" label="Mark" sort={sort} dir={dir} onSort={onSort} />
            <Head id="change" label="1h" sort={sort} dir={dir} onSort={onSort} />
            <Head id="funding" label="Fund" sort={sort} dir={dir} onSort={onSort} />
            <Head id="oi" label="OI" sort={sort} dir={dir} onSort={onSort} />
          </div>
          <div className="max-h-[min(70vh,420px)] overflow-auto pb-1">
            {rows.length === 0 ? (
              <p className="px-3 py-3 text-[11px] text-[var(--dim)]">No markets.</p>
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
                    className={`grid w-full ${COLS} items-center px-3 py-1.5 text-left text-xs ${
                      on || i === hi ? "bg-[var(--hover)]" : "hover:bg-[var(--hover)]"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate font-medium text-[var(--text)]">{item.symbol.replace("-USD", "")}</span>
                      <span className="shrink-0 text-[9px] uppercase text-[var(--dim)]">{item.category}</span>
                    </span>
                    <span className="num text-right text-[var(--perp)]">
                      {t ? fmtPx(t.markPrice, item.priceDecimals) : "—"}
                    </span>
                    <span className={`num text-right ${ch != null ? signedClass(ch) : "text-[var(--dim)]"}`}>
                      {ch != null ? fmtPct(ch) : "—"}
                    </span>
                    <span className={`num text-right ${t ? signedClass(t.fundingRate) : "text-[var(--dim)]"}`}>
                      {t ? fmtFunding(t.fundingRate) : "—"}
                    </span>
                    <span className="num text-right text-[var(--muted)]">
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

function Head({
  id,
  label,
  align = "right",
  sort,
  dir,
  onSort,
}: {
  id: SortCol;
  label: string;
  align?: "left" | "right";
  sort: SortCol;
  dir: SortDir;
  onSort: (id: SortCol) => void;
}) {
  const on = sort === id;
  return (
    <button
      type="button"
      onClick={() => onSort(id)}
      className={`w-full ${align === "right" ? "text-right" : "text-left"} ${
        on ? "text-[var(--text)]" : "text-[var(--dim)] hover:text-[var(--muted)]"
      }`}
    >
      {label}
      {on ? (dir === "desc" ? " ↓" : " ↑") : ""}
    </button>
  );
}
