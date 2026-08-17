"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { fmtOdds } from "@/lib/format";
import type { PerpsInstrument, ResolvedEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

const DESTINATIONS = [
  { href: "/", label: "Signals", hint: "Ranked setups" },
  { href: "/markets", label: "Markets", hint: "Perp table" },
  { href: "/portfolio", label: "Portfolio", hint: "Positions and equity" },
  { href: "/about", label: "About", hint: "How Leadgap works" },
] as const;

type MarketHit = Pick<PerpsInstrument, "symbol" | "baseAsset" | "category">;
type EventHit = {
  id: string;
  title: string;
  question: string;
  symbol: string;
  yesPrice: number;
};

export function CommandSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mod, setMod] = useState("⌘");
  const [markets, setMarkets] = useState<MarketHit[]>([]);
  const [events, setEvents] = useState<EventHit[]>([]);

  useEffect(() => {
    const mac = /Mac|iPhone|iPad/.test(navigator.platform) || navigator.userAgent.includes("Mac");
    setMod(mac ? "⌘" : "Ctrl");
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    let stop = false;
    Promise.all([
      fetch("/api/markets").then((res) => res.json() as Promise<{ instruments?: PerpsInstrument[] }>),
      fetch("/api/events").then((res) => res.json() as Promise<{ events?: ResolvedEvent[] }>),
    ])
      .then(([marketPayload, eventPayload]) => {
        if (stop) return;
        setMarkets(
          (marketPayload.instruments ?? []).map((item) => ({
            symbol: item.symbol,
            baseAsset: item.baseAsset,
            category: item.category,
          })),
        );
        const hits: EventHit[] = [];
        const seen = new Set<string>();
        for (const event of eventPayload.events ?? []) {
          const symbol = event.perps[0]?.symbol;
          if (!symbol) continue;
          const key = `${event.id}:${symbol}`;
          if (seen.has(key)) continue;
          seen.add(key);
          hits.push({
            id: event.id,
            title: event.title,
            question: event.question,
            symbol,
            yesPrice: event.yesPrice,
          });
        }
        setEvents(hits);
      })
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, [open]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label="Search"
        className="h-8 gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 text-[12px] text-[var(--muted)] hover:border-[var(--line-strong)] hover:text-[var(--text)]"
      >
        <SearchIcon className="size-3.5" />
        <span className="hidden md:inline">Search</span>
        <Kbd className="hidden rounded-full border-[var(--line)] bg-[var(--elevated)] text-[10px] text-[var(--dim)] md:inline-flex">
          {mod === "⌘" ? "⌘K" : "Ctrl+K"}
        </Kbd>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-lg" showCloseButton={false}>
          <DialogTitle className="sr-only">Search</DialogTitle>
          <DialogDescription className="sr-only">
            Search events and markets, or jump to Signals, Markets, Portfolio, or About.
          </DialogDescription>
          <Command className="rounded-none border-0">
            <CommandInput placeholder="Search events and markets" />
            <CommandList className="max-h-[min(70vh,420px)]">
              <CommandEmpty>No matches.</CommandEmpty>
              <CommandGroup heading="Go">
                {DESTINATIONS.map((item) => (
                  <CommandItem
                    key={item.href}
                    value={`${item.label} ${item.hint}`}
                    onSelect={() => go(item.href)}
                  >
                    <span>{item.label}</span>
                    <span className={cn("ml-auto text-[11px] text-[var(--dim)]")}>{item.hint}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
              {markets.length > 0 ? (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Markets">
                    {markets.map((item) => (
                      <CommandItem
                        key={item.symbol}
                        value={`${item.symbol} ${item.baseAsset} ${item.category} market`}
                        onSelect={() => go(`/markets/${item.symbol}`)}
                      >
                        <span>{item.symbol}</span>
                        <span className="ml-auto text-[11px] text-[var(--dim)]">{item.category}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              ) : null}
              {events.length > 0 ? (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Events">
                    {events.map((item) => (
                      <CommandItem
                        key={`${item.id}:${item.symbol}`}
                        value={`${item.title} ${item.question} ${item.symbol} ${item.id} event`}
                        onSelect={() => go(`/markets/${item.symbol}?event=${item.id}`)}
                      >
                        <span className="min-w-0 truncate">{item.title}</span>
                        <span className="ml-auto shrink-0 text-[11px] text-[var(--dim)]">
                          {item.symbol.replace("-USD", "")} {fmtOdds(item.yesPrice)}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              ) : null}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
