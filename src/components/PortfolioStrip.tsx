"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useWalletClient } from "wagmi";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { polygon } from "viem/chains";
import { PerpsAccessAlert } from "@/components/PerpsAccessAlert";
import { explainPerpsError, type PerpsAccess } from "@/lib/perpsAccess";
import { fmtUsd } from "@/lib/format";
import { usePrivyMount } from "@/lib/usePrivyMount";

type Summary = {
  equity?: number;
  note?: string;
  href?: string;
  needsSignature?: boolean;
  funded?: boolean;
  access?: PerpsAccess | null;
};

type StripContext = {
  busy: boolean;
  state: Summary;
  visible: boolean;
  approvePerps: () => void;
};

const Ctx = createContext<StripContext | null>(null);

function num(v: string | number | undefined): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function PortfolioStripProvider({ children }: { children: ReactNode }) {
  const mount = usePrivyMount();
  if (mount !== "ready") return children;
  return <PortfolioStripSession>{children}</PortfolioStripSession>;
}

function PortfolioStripSession({ children }: { children: ReactNode }) {
  const { authenticated, ready } = usePrivy();
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient({ chainId: polygon.id });
  const walletClientRef = useRef(walletClient);
  walletClientRef.current = walletClient;
  const signerReady = Boolean(walletClient?.account?.address);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<Summary>({});

  useEffect(() => {
    if (!ready || !authenticated || !isConnected || !address) {
      setState({});
      return;
    }
    const wc = walletClientRef.current;
    if (!wc?.account?.address) return;
    let stop = false;
    setBusy(true);
    (async () => {
      try {
        const { resumePerpsSession } = await import("@/lib/perpsSession");
        const opened = await resumePerpsSession(wc);
        if (stop) return;
        if (!opened) {
          setState({ needsSignature: true });
          return;
        }
        const { session } = opened;
        const portfolio = await session.fetchPortfolio();
        if (stop) return;
        const margin = portfolio.margin ?? {};
        setState({
          funded: true,
          equity: num(margin.totalAccountValue ?? portfolio.withdrawable),
        });
      } catch (err) {
        if (!stop) {
          const access = explainPerpsError(err);
          setState({
            note: access.message,
            href: access.href,
            access: access.kind === "invite" ? access : null,
            needsSignature: access.kind !== "invite",
          });
        }
      } finally {
        if (!stop) setBusy(false);
      }
    })();
    return () => {
      stop = true;
    };
  }, [address, authenticated, isConnected, ready, retry, signerReady]);

  useEffect(() => {
    if (!state.funded) return;
    const id = setInterval(() => setRetry((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, [state.funded]);

  async function approvePerps() {
    const wc = walletClientRef.current;
    if (!wc?.account?.address) return;
    setBusy(true);
    try {
      const { openCachedPerpsSession } = await import("@/lib/perpsSession");
      await openCachedPerpsSession(wc);
      setRetry((n) => n + 1);
    } catch (err) {
      const access = explainPerpsError(err);
      setState({
        note: access.message,
        href: access.href,
        access: access.kind === "invite" ? access : null,
        needsSignature: access.kind !== "invite",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Ctx.Provider
      value={{
        busy,
        state,
        visible: ready && authenticated,
        approvePerps,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function PortfolioStrip() {
  const ctx = useContext(Ctx);
  if (!ctx?.visible) return null;
  const { busy, state, approvePerps } = ctx;
  const showNote = Boolean(state.note && !state.access);
  const showHref = Boolean(state.href && !state.access);
  if (!state.funded && !state.needsSignature && !showNote && !showHref) return null;

  return (
    <div className="flex min-w-0 items-center gap-2 text-[11px]">
      {state.funded ? (
        <span className="text-[var(--muted)]">
          Eq <span className="num text-[var(--text)]">{fmtUsd(state.equity)}</span>
        </span>
      ) : null}
      {state.needsSignature ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void approvePerps()}
          className="lg-focus whitespace-nowrap border border-[color-mix(in_srgb,var(--signal)_45%,var(--line))] px-2 py-0.5 text-[11px] font-medium text-[var(--signal)] disabled:opacity-40"
        >
          {busy ? "…" : "Connect Perps"}
        </button>
      ) : null}
      {showNote ? (
        <span className="hidden max-w-[160px] truncate text-[var(--warn)] sm:inline" title={state.note}>
          {state.note}
        </span>
      ) : null}
      {showHref ? (
        <a href={state.href} target="_blank" rel="noreferrer" className="text-[var(--signal)] hover:underline">
          Access
        </a>
      ) : null}
    </div>
  );
}

export function PortfolioStripAlert() {
  const ctx = useContext(Ctx);
  if (!ctx?.state.access) return null;
  return <PerpsAccessAlert access={ctx.state.access} />;
}
