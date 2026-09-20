"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

const KEY = "leadgap:tour";

type Step = {
  target: string;
  rail: string;
  hint: string;
  title: string;
  body: React.ReactNode[];
};

const STEPS: Step[] = [
  {
    target: "event",
    rail: "A signal is one event, one perp",
    hint: "The pairing",
    title: "One event. One perp.",
    body: [
      "Each row pairs a Polymarket event with the perpetual it maps to. The chip names the perp; the line beneath says how the two are linked.",
      "Open the title for the full signal — mapping, score breakdown and history.",
    ],
  },
  {
    target: "gap",
    rail: "Read the gap",
    hint: "Implied vs observed",
    title: "This band is the whole product.",
    body: [
      <>
        The <span className="text-odds">lime line</span> is the move the
        event’s odds imply. The <span className="text-mark">bone line</span> is
        what the perp actually did. The shaded band between them is the gap —
        the part the market hasn’t taken yet.
      </>,
      "A widening band means the mark is falling further behind. A closing band means you’re late.",
    ],
  },
  {
    target: "score",
    rail: "The score ranks, it does not promise",
    hint: "0–100, heuristic",
    title: "The score ranks. It does not promise.",
    body: [
      "Scores combine the residual, relative move magnitude, mapping confidence, odds movement and liquidity. Candidates also need an observed odds lead, fresh quotes and a gap above estimated costs. These are research screens.",
      "A higher score is a cleaner setup, not a higher chance of profit.",
    ],
  },
  {
    target: "direction",
    rail: "Open the desk to act",
    hint: "Trade the perp",
    title: "Open the desk to act.",
    body: [
      "The direction is the side the gap implies. From a signal, open its desk to see the chart, book and funding, then size a perp order deliberately.",
      "You trade the perpetual, not the event’s Yes or No shares.",
    ],
  },
];

const noop = () => () => {};

function shouldStart(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get("tour") === "1")
      return true;
    if (window.localStorage.getItem(KEY) === "done") return false;
  } catch {
    return false;
  }
  return window.matchMedia("(min-width: 1024px)").matches;
}

type Rect = { top: number; left: number; width: number; height: number };

/** First-visit walkthrough of how to read a signal row. */
export function SignalTour() {
  const start = useSyncExternalStore(noop, shouldStart, () => false);
  const [dismissed, setDismissed] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const open = start && !dismissed;
  const current = STEPS[step]!;

  useEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = document.querySelector<HTMLElement>(
        `[data-tour="${current.target}"]`,
      );
      if (!el) {
        setRect(null);
        return;
      }
      const box = el.getBoundingClientRect();
      const pad = 8;
      setRect({
        top: box.top - pad,
        left: box.left - pad,
        width: box.width + pad * 2,
        height: box.height + pad * 2,
      });
    };
    const id = requestAnimationFrame(() => {
      document
        .querySelector(`[data-tour="${current.target}"]`)
        ?.scrollIntoView({ block: "nearest" });
      measure();
      nextRef.current?.focus();
    });
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, current.target]);

  function finish() {
    try {
      window.localStorage.setItem(KEY, "done");
    } catch {
      // Without storage the tour simply shows again next visit.
    }
    setDismissed(true);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      finish();
      return;
    }
    if (e.key !== "Tab") return;
    const focusable = cardRef.current?.querySelectorAll<HTMLElement>("button");
    if (!focusable?.length) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  if (!open) return null;

  const cardWidth = 398;
  const vw = typeof window === "undefined" ? 1440 : window.innerWidth;
  const vh = typeof window === "undefined" ? 900 : window.innerHeight;
  let cardLeft = 0;
  let cardTop = 0;
  if (rect) {
    const leftRoom = rect.left - 24;
    cardLeft =
      leftRoom >= cardWidth + 330
        ? rect.left - cardWidth - 24
        : Math.min(vw - cardWidth - 24, rect.left + rect.width + 24);
    if (cardLeft < 330 && rect.left + rect.width + cardWidth + 48 > vw)
      cardLeft = Math.max(330, Math.min(vw - cardWidth - 24, rect.left));
    cardTop = Math.min(
      Math.max(80, rect.top + rect.height / 2 - 120),
      vh - 340,
    );
  }

  return (
    <div
      className="fixed inset-0 z-50"
      onKeyDown={onKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
      aria-describedby="tour-body"
    >
      {rect ? (
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-[10px] border border-odds"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            boxShadow:
              "0 0 0 6px rgba(203,241,82,0.12), 0 0 0 9999px rgba(8,8,6,0.78)",
          }}
        />
      ) : (
        <div aria-hidden className="fixed inset-0 bg-[rgba(8,8,6,0.78)]" />
      )}
      <ol
        aria-label="Walkthrough steps"
        className="fixed top-[198px] left-6 hidden w-[290px] flex-col gap-3.5 rounded-[10px] bg-[rgba(8,8,6,0.88)] p-4 xl:flex"
        style={rect ? { top: Math.max(80, cardTop) } : undefined}
      >
        {STEPS.map((item, i) => (
          <li
            key={item.target}
            aria-current={i === step ? "step" : undefined}
            className={cn("flex items-start gap-3", i !== step && "opacity-45")}
          >
            <span
              className={cn(
                "num w-4 text-[11px]",
                i === step ? "text-odds" : "text-dim",
              )}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span>
              <span className="block text-[13px] text-text">{item.rail}</span>
              {i === step ? (
                <span className="mt-[3px] block text-[11px] text-dim">
                  {item.hint}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
      <div
        ref={cardRef}
        className="fixed w-[398px] max-w-[calc(100vw-32px)] rounded-xl border border-line-strong bg-surface p-[22px] shadow-[0_24px_48px_-16px_rgba(0,0,0,0.7)]"
        style={
          rect
            ? { top: cardTop, left: cardLeft }
            : { top: "50%", left: "50%", transform: "translate(-50%,-50%)" }
        }
      >
        <div className="flex items-center justify-between">
          <span className="num text-[10px] tracking-[0.1em] text-odds">
            STEP {step + 1} OF {STEPS.length}
          </span>
          <button
            type="button"
            onClick={finish}
            className="lg-focus text-[12px] text-dim hover:text-text"
          >
            Skip tour
          </button>
        </div>
        <h2 id="tour-title" className="serif mt-3 text-[26px] leading-[1.2]">
          {current.title}
        </h2>
        <div id="tour-body">
          {current.body.map((line, i) => (
            <p key={i} className="mt-2.5 text-[13px] leading-[1.65] text-subtle">
              {line}
            </p>
          ))}
        </div>
        <div className="mt-[18px] flex items-center gap-2.5">
          <span className="flex gap-[5px]" aria-hidden>
            {STEPS.map((item, i) => (
              <span
                key={item.target}
                className={cn(
                  "h-[3px] w-5 rounded-full",
                  i === step ? "bg-odds" : "bg-off",
                )}
              />
            ))}
          </span>
          <div className="ml-auto flex gap-2">
            {step > 0 ? (
              <button
                type="button"
                onClick={() => setStep((n) => n - 1)}
                className="lg-focus h-[34px] rounded-[7px] border border-line-strong px-3.5 text-[13px] text-subtle hover:text-text"
              >
                Back
              </button>
            ) : null}
            <button
              ref={nextRef}
              type="button"
              onClick={() =>
                step === STEPS.length - 1 ? finish() : setStep((n) => n + 1)
              }
              className="lg-focus h-[34px] rounded-[7px] bg-odds px-4 text-[13px] font-semibold text-on-odds"
            >
              {step === STEPS.length - 1 ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
