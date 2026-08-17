"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useWalletClient } from "wagmi";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { polygon } from "viem/chains";
import { PerpsAccessAlert } from "@/components/PerpsAccessAlert";
import { notifyErr } from "@/lib/notify";
import {
  explainPerpsError,
  lookupPerpsAccount,
  PERPS_INVITE_ACCESS,
  type PerpsAccess,
} from "@/lib/perpsAccess";
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
  const toastedInvite = useRef(false);
  const probed = useRef(false);

  useEffect(() => {
    toastedInvite.current = false;
    probed.current = false;
  }, [address]);

  async function probeAddresses(eoa: string, signer?: string): Promise<string[]> {
    const candidates = [eoa, signer].filter(Boolean) as string[];
    try {
      const params = new URLSearchParams();
      params.append("address", eoa);
      const profile = await fetch(`/api/profile?${params}`).then((r) => (r.ok ? r.json() : null));
      const proxy =
        profile && typeof profile === "object" && "proxyWallet" in profile
          ? String((profile as { proxyWallet?: string | null }).proxyWallet ?? "")
          : "";
      if (proxy) candidates.push(proxy);
    } catch {
      // probe the signer even if Gamma profile is missing
    }
    return candidates;
  }

  function markInvite(): Summary {
    if (!toastedInvite.current) {
      toastedInvite.current = true;
      notifyErr(PERPS_INVITE_ACCESS.message);
    }
    return {
      needsSignature: true,
      note: PERPS_INVITE_ACCESS.message,
      href: PERPS_INVITE_ACCESS.href,
      access: PERPS_INVITE_ACCESS,
    };
  }

  useEffect(() => {
    if (!ready || !authenticated || !isConnected || !address) {
      setState({});
      return;
    }
    const wc = walletClientRef.current;
    if (!wc?.account?.address) return;
    let stop = false;
    if (!probed.current) setBusy(true);
    (async () => {
      try {
        const exists = await lookupPerpsAccount(await probeAddresses(address, wc.account?.address));
        if (stop) return;
        if (exists === "missing") {
          setState(markInvite());
          return;
        }

        const { resumePerpsSession } = await import("@/lib/perpsSession");
        const opened = await resumePerpsSession(wc);
        if (stop) return;
        if (!opened) {
          setState({ needsSignature: true });
          return;
        }
        const { session, client } = opened;
        const wallet = client.account.wallet ? String(client.account.wallet) : "";
        if (wallet) {
          const sessionExists = await lookupPerpsAccount([wallet, address]);
          if (stop) return;
          if (sessionExists === "missing") {
            setState(markInvite());
            return;
          }
        }
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
          if (access.kind === "invite" && !toastedInvite.current) {
            toastedInvite.current = true;
            notifyErr(access.message);
          }
          setState({
            note: access.message,
            href: access.href,
            access: access.kind === "invite" ? access : null,
            needsSignature: true,
          });
        }
      } finally {
        probed.current = true;
        if (!stop) setBusy(false);
      }
    })();
    return () => {
      stop = true;
    };
  }, [address, authenticated, isConnected, ready, retry, signerReady]);

  useEffect(() => {
    if (state.access?.kind !== "invite") return;
    const id = setInterval(() => setRetry((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, [state.access?.kind]);

  async function approvePerps() {
    const wc = walletClientRef.current;
    const eoa = address;
    if (!wc?.account?.address || !eoa) return;
    setBusy(true);
    try {
      const exists = await lookupPerpsAccount(await probeAddresses(eoa, wc.account.address));
      if (exists === "missing") {
        setState(markInvite());
        return;
      }
      const { openCachedPerpsSession } = await import("@/lib/perpsSession");
      await openCachedPerpsSession(wc);
      setRetry((n) => n + 1);
    } catch (err) {
      const access = explainPerpsError(err);
      if (access.kind === "invite" && !toastedInvite.current) {
        toastedInvite.current = true;
        notifyErr(access.message);
      }
      setState({
        note: access.message,
        href: access.href,
        access: access.kind === "invite" ? access : null,
        needsSignature: true,
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

export function usePerpsStrip(): StripContext | null {
  return useContext(Ctx);
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
