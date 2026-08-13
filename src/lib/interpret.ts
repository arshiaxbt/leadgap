import type { GapRow } from "./types";

export type InterpretSource = "model" | "rules";

type Provider = {
  id: string;
  url: string;
  key: string;
  model: string;
  extraHeaders?: Record<string, string>;
};

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
  const odds = `${args.oddsMove >= 0 ? "+" : ""}${(args.oddsMove * 100).toFixed(1)}¢`;
  const perp = `${args.perpMove >= 0 ? "+" : ""}${(args.perpMove * 100).toFixed(2)}%`;
  const lead =
    args.leader === "odds"
      ? "Prediction-market odds moved first relative to the perp mark."
      : args.leader === "perp"
        ? "The perp mark moved first; the event book is the lagging leg (not tradable in this app)."
        : "Odds and the perp moved in similar proportion over this window.";
  return [
    `Mapped event “${args.title}” (${args.question}) to ${args.symbol} because ${args.mappingReason}.`,
    `A rise in Yes odds is treated as ${dir} ${args.symbol} (signed beta ${args.signedBeta}).`,
    `Window moves: odds ${odds}, mark ${perp}, gap ${(args.gap * 100).toFixed(2)} pts.`,
    lead,
    "This is a mapping note, not a trade recommendation.",
  ].join(" ");
}

function providers(): Provider[] {
  const out: Provider[] = [];
  if (process.env.GROQ_API_KEY) {
    out.push({
      id: "groq",
      url: "https://api.groq.com/openai/v1/chat/completions",
      key: process.env.GROQ_API_KEY,
      model: process.env.GROQ_MODEL ?? "openai/gpt-oss-120b",
    });
  }
  if (process.env.GEMINI_API_KEY) {
    out.push({
      id: "gemini",
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      key: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite",
    });
  }
  if (process.env.OPENROUTER_API_KEY) {
    out.push({
      id: "openrouter",
      url: "https://openrouter.ai/api/v1/chat/completions",
      key: process.env.OPENROUTER_API_KEY,
      model: process.env.OPENROUTER_MODEL ?? "openai/gpt-oss-120b:free",
      extraHeaders: {
        "HTTP-Referer": process.env.OPENROUTER_REFERER ?? "http://localhost:3000",
        "X-Title": "Leadgap",
      },
    });
  }
  return out;
}

export function interpretStatus() {
  const configured = providers().map((p) => ({ id: p.id, model: p.model }));
  return {
    configured,
    recommended: "groq",
    model: configured[0]?.model ?? null,
    ready: configured.length > 0,
  };
}

async function chat(provider: Provider, args: object): Promise<string | null> {
  const res = await fetch(provider.url, {
    method: "POST",
    signal: AbortSignal.timeout(20_000),
    headers: {
      authorization: `Bearer ${provider.key}`,
      "content-type": "application/json",
      ...provider.extraHeaders,
    },
    body: JSON.stringify({
      model: provider.model,
      temperature: 0.2,
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content:
            "Explain a mapped Polymarket event vs perp divergence. Use only the provided fields. Do not invent a mapping, catalyst, or trade recommendation. 90 words max. Plain prose.",
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
  for (const provider of providers()) {
    try {
      const text = await chat(provider, args);
      if (text) {
        return { text, source: "model", model: provider.model, provider: provider.id };
      }
    } catch {
      // try next provider
    }
  }
  return { text: fallback, source: "rules", model: "rules", provider: "rules" };
}
