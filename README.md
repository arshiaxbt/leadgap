# Leadgap

Public web app that watches Polymarket event odds against every live Polymarket Perp and lets eligible users trade the related perp. The server samples books in the background, so you do not need to leave a tab open.

Interpretation uses a **free cloud LLM API** (not a local model). Default: Groq `openai/gpt-oss-120b`.

## Run

```bash
cd poly-event-terminal
cp .env.example .env.local
# paste GROQ_API_KEY=gsk_...
npm install
npm run dev
```

Open [https://localhost:3000](https://localhost:3000). First ingest can take ~30 seconds; after that the server keeps history on its own.

## Free API keys (pick one)

**Recommended: Groq** — fastest, no card, high daily cap, does not train on your prompts.

1. Open [https://console.groq.com](https://console.groq.com)
2. Sign up / log in
3. API Keys → Create API Key
4. Put it in `.env.local`:

```
GROQ_API_KEY=gsk_...
GROQ_MODEL=openai/gpt-oss-120b
```

That model is Groq’s current production replacement for Llama 3.3 70B (Llama 3.3 shuts down on Groq free/dev on **16 Aug 2026**).

**Also good: Google Gemini** — best quality on the free tier (Gemini 2.5 / 3.5 Flash).

1. Open [https://aistudio.google.com](https://aistudio.google.com)
2. Get API key
3. `.env.local`: `GEMINI_API_KEY=...`

**Also good: OpenRouter** — one key, many `:free` models.

1. Open [https://openrouter.ai](https://openrouter.ai)
2. Keys → Create
3. `.env.local`: `OPENROUTER_API_KEY=sk-or-...`

If several keys are set, the app tries Groq, then Gemini, then OpenRouter.

## Login (same stack as Polymarket)

Polymarket.com uses [Privy](https://privy.io) for email, Google, injected wallets, WalletConnect, and an embedded wallet for people who do not have one. This app uses that same flow. You cannot reuse Polymarket’s Privy app — create your own:

1. Open [https://dashboard.privy.io](https://dashboard.privy.io) and create an app
2. Enable **Email**, **Google**, and **Wallet**
3. Enable embedded wallets for users without a wallet
4. Allowlist `http://localhost:3000` and your public origin (for example `http://138.124.119.188:3000`)
5. Put the App ID in `.env.local`:

```
NEXT_PUBLIC_PRIVY_APP_ID=clxxxxxxxx
```

## Builder attribution (grants)

Every order attaches builder **arshia**. Keep maker/taker add-on at **0% / 0%**.

For gasless Polymarket wallet deploy (the Safe / Deposit Wallet polymarket.com creates after login), add builder API credentials from [Settings → Builders → Create New](https://polymarket.com/settings?tab=builder):

```
POLYMARKET_BUILDER_API_KEY=
POLYMARKET_BUILDER_SECRET=
POLYMARKET_BUILDER_PASSPHRASE=
```

Never prefix those with `NEXT_PUBLIC_`.

## Optional

- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` from [cloud.reown.com](https://cloud.reown.com) for WalletConnect QR in the Privy modal.
