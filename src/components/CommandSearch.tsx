"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { fmtOdds } from "@/lib/format";
import { perpName } from "@/lib/signal";
import type { PerpsInstrument, ResolvedEvent } from "@/lib/types";

const DESTINATIONS = [
  { href: "/", label: "Signals", hint: "Ranked setups" },
  { href: "/markets", label: "Markets", hint: "Perp table" },
  { href: "/watchlist", label: "Watchlist", hint: "Saved & alerts" },
  { href: "/portfolio", label: "Portfolio", hint: "Positions and equity" },
  { href: "/model", label: "Model", hint: "How the score works" },
  { href: "/about", label: "Guide", hint: "How Leadgap works" },
] as const;

type MarketHit = Pick<PerpsInstrument, "symbol" | "baseAsset" | "category">;
type EventHit = {
  id: string;
  title: string;
  question: string;
  symbols: string[];
  yesPrice: number;
};

const subscribePlatform = () => () => {};

export function CommandSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const mod = useSyncExternalStore(
    subscribePlatform,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"),
    () => "⌘",
  );
  const [markets, setMarkets] = useState<MarketHit[]>([]);
  const [events, setEvents] = useState<EventHit[]>([]);

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
      fetch("/api/markets").then(
        (res) => res.json() as Promise<{ instruments?: PerpsInstrument[] }>,
      ),
      fetch("/api/events").then(
        (res) => res.json() as Promise<{ events?: ResolvedEvent[] }>,
      ),
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
          if (!event.perps.length || seen.has(event.id)) continue;
          seen.add(event.id);
          hits.push({
            id: event.id,
            title: event.title,
            question: event.question,
            symbols: [...new Set(event.perps.map((p) => p.symbol))],
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

  const shortcut = mod === "⌘" ? "⌘K" : "Ctrl K";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search"
        aria-keyshortcuts="Meta+K Control+K"
        className="lg-focus flex h-8 shrink-0 items-center gap-2 rounded-[7px] text-[13px] text-dim transition-colors hover:text-text md:border md:border-line-strong md:bg-surface md:px-2.5 xl:w-[260px]"
      >
        <SearchIcon className="size-[18px] text-subtle md:size-3.5 md:text-current" />
        <span className="hidden flex-1 text-left xl:inline">
          Events, markets, symbols
        </span>
        <span className="num hidden text-[10px] md:inline">{shortcut}</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="top-[18%] translate-y-0 gap-0 overflow-hidden rounded-xl border-line-strong bg-surface p-0 shadow-[0_20px_40px_-12px_rgba(0,0,0,0.6)] sm:top-1/2 sm:max-w-[540px] sm:translate-y-[-50%]"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">Search</DialogTitle>
          <DialogDescription className="sr-only">
            Search events and markets, or jump to a section of Leadgap.
          </DialogDescription>
          <Command className="rounded-none border-0 bg-transparent">
            <CommandInput placeholder="Search events, markets, symbols" />
            <CommandList className="max-h-[min(60vh,420px)] p-2">
              <CommandEmpty className="py-6 text-center text-[13px] text-subtle">
                No matches.
              </CommandEmpty>
              <CommandGroup heading="Go">
                {DESTINATIONS.map((item) => (
                  <CommandItem
                    key={item.href}
                    value={`${item.label} ${item.hint}`}
                    onSelect={() => go(item.href)}
                  >
                    <span>{item.label}</span>
                    <span className="ml-auto text-[11px] text-dim">
                      {item.hint}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
              {events.length > 0 ? (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Events">
                    {events.map((item) => (
                      <CommandItem
                        key={item.id}
                        value={`${item.title} ${item.question} ${item.symbols.join(" ")} ${item.id} event`}
                        onSelect={() => go(`/events/${encodeURIComponent(item.id)}`)}
                      >
                        <span className="min-w-0 truncate">{item.title}</span>
                        <span className="num ml-auto shrink-0 text-[11px] text-odds">
                          {perpName(item.symbols[0]!)} {fmtOdds(item.yesPrice)}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              ) : null}
              {markets.length > 0 ? (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Markets">
                    {markets.map((item) => (
                      <CommandItem
                        key={item.symbol}
                        value={`${item.symbol} ${item.baseAsset} ${item.category} market`}
                        onSelect={() =>
                          go(`/markets/${encodeURIComponent(item.symbol)}`)
                        }
                      >
                        <span>{perpName(item.symbol)}</span>
                        <span className="ml-auto text-[11px] capitalize text-dim">
                          {item.category}
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
