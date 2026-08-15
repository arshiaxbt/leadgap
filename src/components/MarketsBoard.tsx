"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fmtFunding, fmtPct, fmtPx, signedClass } from "@/lib/format";
import { mapBySymbol } from "@/lib/mapping";
import type { PerpsInstrument, PerpsTicker } from "@/lib/types";
import { LiveDot, Pill, Segmented, TextInput } from "@/components/ui";

type Payload = {
  instruments: PerpsInstrument[];
  tickers: Record<string, PerpsTicker>;
  eventCounts?: Record<string, number>;
  error: string | null;
  asOf: number;
};

type SortCol = "name" | "mark" | "index" | "change" | "funding" | "oi" | "lev" | "events";
type SortDir = "asc" | "desc";

const EMPTY_COUNTS: Record<string, number> = {};

const CATS = [
  { id: "all", label: "All" },
  { id: "index", label: "Index" },
  { id: "commodity", label: "Commodities" },
  { id: "crypto", label: "Crypto" },
  { id: "equity", label: "Equities" },
];

function sortValue(
  inst: PerpsInstrument,
  col: SortCol,
  tickers: Record<string, PerpsTicker>,
  eventCounts: Record<string, number>,
): number | string {
  const t = tickers[inst.symbol];
  switch (col) {
    case "name":
      return inst.symbol;
    case "mark":
      return t?.markPrice ?? 0;
    case "index":
      return t?.indexPrice ?? 0;
    case "change":
      return t?.change1h ?? 0;
    case "funding":
      return t?.fundingRate ?? 0;
    case "oi":
      return t?.openInterest ?? 0;
    case "lev":
      return inst.maxLeverage;
    case "events":
      return eventCounts[inst.symbol] ?? 0;
    default: {
      const _never: never = col;
      return _never;
    }
  }
}

export function MarketsBoard() {
  const [data, setData] = useState<Payload | null>(null);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortCol>("oi");
  const [dir, setDir] = useState<SortDir>("desc");
  const mapped = useMemo(() => mapBySymbol(), []);

  useEffect(() => {
    let stop = false;
    async function load() {
      const res = await fetch("/api/markets");
      const json = (await res.json()) as Payload;
      if (!stop) setData(json);
    }
    load();
    const id = setInterval(load, 20_000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);

  const eventCounts = data?.eventCounts ?? EMPTY_COUNTS;

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const tickers = data?.tickers ?? {};
    return (data?.instruments ?? [])
      .filter((i) => {
        if (filter !== "all" && i.category !== filter) return false;
        if (!needle) return true;
        const hay = `${i.symbol} ${i.baseAsset} ${i.category}`.toLowerCase();
        return hay.includes(needle);
      })
      .sort((a, b) => {
        const va = sortValue(a, sort, tickers, eventCounts);
        const vb = sortValue(b, sort, tickers, eventCounts);
        const cmp =
          typeof va === "string" && typeof vb === "string" ? va.localeCompare(vb) : Number(va) - Number(vb);
        if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
        return a.symbol.localeCompare(b.symbol);
      });
  }, [data, dir, eventCounts, filter, q, sort]);

  function onSort(col: SortCol) {
    if (sort === col) {
      setDir((d) => (d === "desc" ? "asc" : "desc"));
      return;
    }
    setSort(col);
    setDir(col === "name" ? "asc" : "desc");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="lg-toolbar flex-wrap justify-between gap-2 py-1.5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="event-title text-[17px] italic text-[var(--text)]">Markets</h1>
          <span className="text-[12px] text-[var(--muted)]">
            <span className="num text-[var(--text)]">{data?.instruments.length ?? "—"}</span> instruments
          </span>
          <LiveDot />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="w-40">
            <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" />
          </div>
          <Segmented compact options={CATS} value={filter} onChange={setFilter} />
        </div>
      </div>
      {data?.error ? <p className="px-3 py-1 text-[12px] text-[var(--warn)]">{data.error}</p> : null}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="lg-table w-full min-w-[760px] text-left text-sm">
          <thead className="sticky top-0 bg-[var(--bg)]">
            <tr>
              <Head id="name" label="Market" pad="px-3" sort={sort} dir={dir} onSort={onSort} />
              <Head id="mark" label="Mark" sort={sort} dir={dir} onSort={onSort} />
              <Head id="index" label="Index" sort={sort} dir={dir} onSort={onSort} />
              <Head id="change" label="1h" sort={sort} dir={dir} onSort={onSort} />
              <Head id="funding" label="Funding" sort={sort} dir={dir} onSort={onSort} />
              <Head id="oi" label="OI" sort={sort} dir={dir} onSort={onSort} />
              <Head id="lev" label="Lev" sort={sort} dir={dir} onSort={onSort} />
              <Head id="events" label="Events" pad="px-3" sort={sort} dir={dir} onSort={onSort} />
            </tr>
          </thead>
          <tbody>
            {rows.map((inst) => {
              const t = data?.tickers[inst.symbol];
              const change = t?.change1h ?? null;
              const cluster = mapped.get(inst.symbol)?.cluster;
              const events = eventCounts[inst.symbol] ?? 0;
              return (
                <tr key={inst.symbol} className="lg-row">
                  <td className="px-3 py-2">
                    <Link href={`/markets/${inst.symbol}`} className="font-medium text-[var(--text)] hover:underline">
                      {inst.symbol.replace("-USD", "")}
                    </Link>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--dim)]">
                      <span className="capitalize">{inst.category}</span>
                      {cluster ? <Pill>{cluster}</Pill> : null}
                    </div>
                  </td>
                  <td className="num px-2 py-2 text-[var(--perp)]">{t ? fmtPx(t.markPrice, inst.priceDecimals) : "—"}</td>
                  <td className="num px-2 py-2 text-[var(--muted)]">
                    {t ? fmtPx(t.indexPrice, inst.priceDecimals) : "—"}
                  </td>
                  <td className={`num px-2 py-2 ${change != null ? signedClass(change) : "text-[var(--dim)]"}`}>
                    {change != null ? fmtPct(change) : "—"}
                  </td>
                  <td className={`num px-2 py-2 ${t ? signedClass(t.fundingRate) : "text-[var(--dim)]"}`}>
                    {t ? fmtFunding(t.fundingRate) : "—"}
                  </td>
                  <td className="num px-2 py-2 text-[var(--muted)]">{t ? fmtPx(t.openInterest, 2) : "—"}</td>
                  <td className="num px-2 py-2 text-[var(--muted)]">{inst.maxLeverage}x</td>
                  <td className={`num px-3 py-2 ${events > 0 ? "text-[var(--text)]" : "text-[var(--dim)]"}`}>
                    {events}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Head({
  id,
  label,
  pad = "px-2",
  sort,
  dir,
  onSort,
}: {
  id: SortCol;
  label: string;
  pad?: string;
  sort: SortCol;
  dir: SortDir;
  onSort: (id: SortCol) => void;
}) {
  const on = sort === id;
  return (
    <th
      aria-sort={on ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={`${pad} py-2 font-medium`}
    >
      <button
        type="button"
        onClick={() => onSort(id)}
        className={on ? "text-[var(--text)]" : "hover:text-[var(--muted)]"}
      >
        {label}
        {on ? (dir === "desc" ? " ↓" : " ↑") : ""}
      </button>
    </th>
  );
}
