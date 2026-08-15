"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { polygon } from "viem/chains";
import { usePrivyMount } from "@/lib/usePrivyMount";

export type DeskPosition = {
  instrumentId: number;
  symbol: string;
  size: number;
  entry: number;
  leverage: number;
  pnl: number;
  liq: number;
  margin: number;
  funding: number;
};

export type DeskTpSl = { tp: string; sl: string };

function num(v: string | number | undefined): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function useDeskPosition(instrumentId: number): {
  position: DeskPosition | null;
  tpSl: DeskTpSl;
  refresh: () => Promise<void>;
} {
  const mount = usePrivyMount();
  const { isConnected } = useAccount();
  const { data: walletClient } = useWalletClient({ chainId: polygon.id });
  const [position, setPosition] = useState<DeskPosition | null>(null);
  const [tpSl, setTpSl] = useState<DeskTpSl>({ tp: "", sl: "" });

  const refresh = useCallback(async () => {
    if (mount !== "ready" || !isConnected || !walletClient) {
      setPosition(null);
      setTpSl({ tp: "", sl: "" });
      return;
    }
    try {
      const { resumePerpsSession } = await import("@/lib/perpsSession");
      const opened = await resumePerpsSession(walletClient);
      if (!opened) {
        setPosition(null);
        setTpSl({ tp: "", sl: "" });
        return;
      }
      const { session } = opened;
      const portfolio = await session.fetchPortfolio();
      const raw = (portfolio.positions ?? []).find(
        (p) => Number(p.instrumentId) === instrumentId && Number(p.size) !== 0,
      );
      setPosition(
        raw
          ? {
              instrumentId: Number(raw.instrumentId),
              symbol: raw.symbol,
              size: num(raw.size),
              entry: num(raw.entryPrice),
              leverage: Number(raw.leverage) || 0,
              pnl: num(raw.unrealizedPnl),
              liq: num(raw.liquidationPrice),
              margin: num(raw.initialMargin),
              funding: num(raw.cumulativeFunding),
            }
          : null,
      );
      const open = await session.fetchOpenOrders().catch(() => []);
      let tp = "";
      let sl = "";
      for (const order of open ?? []) {
        if (Number(order.instrumentId) !== instrumentId) continue;
        const kind = order.tpSl?.kind;
        const trigger = order.tpSl?.triggerPrice;
        if (!kind || trigger == null) continue;
        if (kind === "tp") tp = String(trigger);
        if (kind === "sl") sl = String(trigger);
      }
      setTpSl({ tp, sl });
    } catch {
      setPosition(null);
      setTpSl({ tp: "", sl: "" });
    }
  }, [instrumentId, isConnected, mount, walletClient]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  return { position, tpSl, refresh };
}
