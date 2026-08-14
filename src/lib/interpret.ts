import { fmtOddsDelta } from "./format";
import type { GapRow } from "./types";

export type InterpretSource = "model" | "rules";

export function deterministicNote(args: {
  title: string;
  question: string;
  symbol: string;
  mappingReason: string;
  oddsMove: number;
  perpMove: number;
  gap: number;
  leader: GapRow["leader"];
  signedBeta: number;
}): string {
  const dir = args.signedBeta >= 0 ? "higher" : "lower";
  const odds = fmtOddsDelta(args.oddsMove);
  const expected = args.oddsMove * args.signedBeta;
  const residual = expected - args.perpMove;
  const perp = `${args.perpMove >= 0 ? "+" : ""}${(args.perpMove * 100).toFixed(2)}%`;
  const lead =
    args.leader === "odds"
      ? "Yes probability moved first relative to the perp mark."
      : args.leader === "perp"
        ? "The perp mark moved first; the event book is the lagging leg (not tradable in this app)."
        : "Yes probability and the perp moved in similar proportion over this window.";
  return [
    `Mapped event “${args.title}” (${args.question}) to ${args.symbol} because ${args.mappingReason}.`,
    `A rise in Yes probability is treated as ${dir} ${args.symbol} (signed beta ${args.signedBeta}).`,
    `Window: Yes ${odds}, implied perp ${expected >= 0 ? "+" : ""}${(expected * 100).toFixed(2)}%, mark ${perp}, residual ${(residual * 100).toFixed(2)}%.`,
    lead,
    "This is a mapping note, not a trade recommendation. Trade the perp only.",
  ].join(" ");
}

function gemini() {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return null;
  return {
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    key,
    model: process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite",
  };
}

export function interpretStatus() {
  const g = gemini();
  return {
    configured: g ? [{ id: "gemini", model: g.model }] : [],
    recommended: "gemini",
    model: g?.model ?? null,
    ready: Boolean(g),
  };
}

async function chat(args: object): Promise<string | null> {
  const provider = gemini();
  if (!provider) return null;
  const res = await fetch(provider.url, {
    method: "POST",
    signal: AbortSignal.timeout(20_000),
    headers: {
      authorization: `Bearer ${provider.key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: provider.model,
      temperature: 0.2,
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content:
            "Explain a mapped Polymarket event vs perp divergence. Use only the provided fields. Do not invent a mapping, catalyst, or trade recommendation. Report Yes probability as a percent (e.g. 16.5%) and Yes changes as percentage points (e.g. -3.5 pts), never cents. 90 words max. Plain prose.",
        },
        { role: "user", content: JSON.stringify(args) },
      ],
    }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return body.choices?.[0]?.message?.content?.trim() || null;
}

export async function interpretGap(args: {
  title: string;
  question: string;
  symbol: string;
  mappingReason: string;
  oddsMove: number;
  perpMove: number;
  gap: number;
  leader: GapRow["leader"];
  signedBeta: number;
}): Promise<{ text: string; source: InterpretSource; model: string; provider: string }> {
  const fallback = deterministicNote(args);
  try {
    const text = await chat(args);
    if (text) return { text, source: "model", model: gemini()!.model, provider: "gemini" };
  } catch {
    // fall through
  }
  return { text: fallback, source: "rules", model: "rules", provider: "rules" };
}
