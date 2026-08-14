"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fmtFunding, fmtPct, fmtPx, sessionLabel, signedClass } from "@/lib/format";
import { mapBySymbol } from "@/lib/mapping";
import type { PerpsInstrument, PerpsTicker } from "@/lib/types";
import { LiveDot, Panel, Pill, Segmented, TextInput } from "@/components/ui";

type Payload = {
  instruments: PerpsInstrument[];
  tickers: Record<string, PerpsTicker>;
  error: string | null;
  asOf: number;
};

const CATS = [
  { id: "all", label: "All" },
  { id: "index", label: "Index" },
  { id: "commodity", label: "Commodities" },
  { id: "crypto", label: "Crypto" },
  { id: "equity", label: "Equities" },
];

export function MarketsBoard() {
  const [data, setData] = useState<Payload | null>(null);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
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

  const rows = (data?.instruments ?? []).filter((i) => {
    if (filter !== "all" && i.category !== filter) return false;
    if (!q.trim()) return true;
    const hay = `${i.symbol} ${i.baseAsset} ${i.category}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Markets</h1>
          <p className="mt-1 text-sm text-[#8b93a7]">
            Every live Polymarket perp. {data?.instruments.length ?? "—"} listed.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <LiveDot />
          <div className="w-40">
            <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" />
          </div>
          <Segmented options={CATS} value={filter} onChange={setFilter} />
        </div>
      </div>
      {data?.error ? <p className="text-sm text-amber-200">{data.error}</p> : null}
      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="text-[11px] uppercase tracking-wide text-[#5c6478]">
            <tr>
              <th className="px-4 py-3 font-medium">Market</th>
              <th className="px-3 py-3 font-medium">Mark</th>
              <th className="px-3 py-3 font-medium">Index</th>
              <th className="px-3 py-3 font-medium">1h</th>
              <th className="px-3 py-3 font-medium">Funding</th>
              <th className="px-3 py-3 font-medium">OI</th>
              <th className="px-3 py-3 font-medium">Lev</th>
              <th className="px-4 py-3 font-medium">Session</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((inst) => {
              const t = data?.tickers[inst.symbol];
              const change = t?.change1h ?? null;
              const cluster = mapped.get(inst.symbol)?.cluster;
              return (
                <tr key={inst.symbol} className="border-t border-[#1e2636] hover:bg-white/[0.03]">
                  <td className="px-4 py-3">
                    <Link href={`/markets/${inst.symbol}`} className="font-medium text-zinc-100 hover:text-white">
                      {inst.symbol.replace("-USD", "")}
                    </Link>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[#5c6478]">
                      <span className="capitalize">{inst.category}</span>
                      {cluster ? <Pill>{cluster}</Pill> : null}
                    </div>
                  </td>
                  <td className="num px-3 py-3">{t ? fmtPx(t.markPrice, inst.priceDecimals) : "—"}</td>
                  <td className="num px-3 py-3 text-[#8b93a7]">
                    {t ? fmtPx(t.indexPrice, inst.priceDecimals) : "—"}
                  </td>
                  <td className={`num px-3 py-3 ${change != null ? signedClass(change) : "text-[#5c6478]"}`}>
                    {change != null ? fmtPct(change) : "—"}
                  </td>
                  <td className="num px-3 py-3">{t ? fmtFunding(t.fundingRate) : "—"}</td>
                  <td className="num px-3 py-3 text-[#8b93a7]">{t ? fmtPx(t.openInterest, 2) : "—"}</td>
                  <td className="num px-3 py-3 text-[#8b93a7]">{inst.maxLeverage}x</td>
                  <td className="px-4 py-3 text-[#8b93a7]">{sessionLabel(inst.category)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
