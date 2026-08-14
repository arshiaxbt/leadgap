# Leadgap

Public terminal that watches Polymarket event odds against every live Polymarket Perp and lets eligible users trade the related perp from a full trading desk.

Interpretation uses **Gemini** (`GEMINI_API_KEY`).

## Run

```bash
cd poly-event-terminal
cp .env.example .env.local
# paste GEMINI_API_KEY=...
npm install
npm run dev
```

Open [https://localhost:3000](https://localhost:3000). First ingest can take ~30 seconds.

## Gemini

1. Open [https://aistudio.google.com](https://aistudio.google.com)
2. Get API key
3. `.env.local`:

```
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.5-flash-lite
```

## Login (same stack as Polymarket)

1. Open [https://dashboard.privy.io](https://dashboard.privy.io) and create an app
2. Enable **Email**, **Google**, and **Wallet**
3. Enable embedded wallets for users without a wallet
4. Allowlist `https://localhost:3000` and `https://leadgap.xyz` (plus any Vercel preview origins)
5. Put the App ID in `.env.local`:

```
NEXT_PUBLIC_PRIVY_APP_ID=clxxxxxxxx
```

## Builder attribution (grants)

Every order attaches builder **arshia**. Keep maker/taker add-on at **0% / 0%**.

```
POLYMARKET_BUILDER_API_KEY=
POLYMARKET_BUILDER_SECRET=
POLYMARKET_BUILDER_PASSPHRASE=
```

Never prefix those with `NEXT_PUBLIC_`.

## Optional

- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` from [cloud.reown.com](https://cloud.reown.com)
