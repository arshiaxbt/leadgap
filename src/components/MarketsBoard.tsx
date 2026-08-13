"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fmtFunding, fmtPct, fmtPx, sessionLabel, signedClass } from "@/lib/format";
import { mapBySymbol } from "@/lib/mapping";
import type { PerpsInstrument, PerpsTicker } from "@/lib/types";

type Payload = {
  instruments: PerpsInstrument[];
  tickers: Record<string, PerpsTicker>;
  error: string | null;
  asOf: number;
};

export function MarketsBoard() {
  const [data, setData] = useState<Payload | null>(null);
  const [filter, setFilter] = useState("all");
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

  const cats = ["all", "index", "commodity", "crypto", "equity"];
  const rows = (data?.instruments ?? []).filter((i) => filter === "all" || i.category === filter);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">All Perps</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Live catalog from the exchange. New listings appear automatically. {data?.instruments.length ?? 0}{" "}
            instruments.
          </p>
        </div>
        <div className="flex gap-1">
          {cats.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setFilter(c)}
              className={`rounded px-2.5 py-1 text-xs capitalize ${filter === c ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800 text-zinc-300"}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      {data?.error ? <p className="mb-3 text-xs text-amber-400">{data.error}</p> : null}
      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="bg-[#12161c] text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2">Symbol</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Mark</th>
              <th className="px-3 py-2">Index</th>
              <th className="px-3 py-2">1h</th>
              <th className="px-3 py-2">Funding</th>
              <th className="px-3 py-2">OI</th>
              <th className="px-3 py-2">Lev</th>
              <th className="px-3 py-2">Session</th>
              <th className="px-3 py-2">Map</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((inst) => {
              const t = data?.tickers[inst.symbol];
              const change = t?.change1h ?? null;
              return (
                <tr key={inst.symbol} className="border-t border-zinc-800 hover:bg-zinc-900/60">
                  <td className="px-3 py-2">
                    <Link href={`/markets/${inst.symbol}`} className="font-medium text-zinc-100 hover:underline">
                      {inst.symbol}
                    </Link>
                  </td>
                  <td className="px-3 py-2 capitalize text-zinc-400">{inst.category}</td>
                  <td className="px-3 py-2">{t ? fmtPx(t.markPrice, inst.priceDecimals) : "—"}</td>
                  <td className="px-3 py-2 text-zinc-400">{t ? fmtPx(t.indexPrice, inst.priceDecimals) : "—"}</td>
                  <td className={`px-3 py-2 ${change != null ? signedClass(change) : "text-zinc-500"}`}>
                    {change != null ? fmtPct(change) : "—"}
                  </td>
                  <td className="px-3 py-2 text-zinc-300">{t ? fmtFunding(t.fundingRate) : "—"}</td>
                  <td className="px-3 py-2 text-zinc-400">{t ? fmtPx(t.openInterest, 2) : "—"}</td>
                  <td className="px-3 py-2 text-zinc-400">{inst.maxLeverage}x</td>
                  <td className="px-3 py-2 text-zinc-400">{sessionLabel(inst.category)}</td>
                  <td className="px-3 py-2 text-xs text-zinc-500">
                    {mapped.has(inst.symbol) ? mapped.get(inst.symbol)!.cluster : "unmapped"}
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
