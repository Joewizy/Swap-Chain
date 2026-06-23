# Railglide

**Stablecoin in from anywhere — local fiat or another chain out.**

Railglide is an open-source Next.js app that routes transfers across multiple liquidity rails: Circle CCTP, Chainrails, Relay, and Paycrest. Users can describe a transfer in plain language, follow guided cash-out / buy / bridge flows, or execute USDC ↔ USDC bridges with a connected wallet.

> **Status:** Early — mainnet Paycrest and testnet CCTP/Relay paths are wired; see [ARCHITECTURE.md](./ARCHITECTURE.md) for the full roadmap and what is not shipped yet.

## Features

- **App at `/swap`** — landing page, conversational send, guided cash-out and buy flows, order status, history, and recipients
- **Multi-rail router** — `POST /api/router` picks CCTP (USDC↔USDC), Chainrails, Relay, or Paycrest from intent shape and corridor
- **Conversational assistant** — `POST /api/chat` multi-turn routing into cash-out, buy, or bridge flows (replaces the older single-shot intent UI on the main path)
- **Paycrest fiat legs** — off-ramp and on-ramp via Sender API; card-based order screen with deposit window, timeline, and transfer renewal
- **CCTP v2** — wallet-signed approve → burn → attestation → mint across supported domains
- **Relay** — quotes and execution for non-USDC and long-tail routes
- **Token + chain registry** — LiFi catalog filtered to supported chains; local fallback on testnet
- **Wallet** — RainbowKit + wagmi; connect required before signing

## Quick start

```bash
git clone https://github.com/Joewizy/Railglide.git
cd railglide
npm install
cp env.example .env.local
npm run dev
```

Open [http://localhost:3000/swap](http://localhost:3000/swap).

### Required environment

| Variable | Purpose |
| -------- | ------- |
| `NEXT_PUBLIC_WALLET_CONNECT_ID` | WalletConnect project ID (RainbowKit) |
| `OPENAI_API_KEY` | Conversational assistant (`/api/chat`) |

`OPENAI_BASE_URL` and `OPENAI_MODEL` are optional; see `env.example` and `src/app/api/chat/route.ts`.

### Rail API keys (enable as you integrate)

| Variable | Rail |
| -------- | ---- |
| `PAYCREST_API_KEY` | Fiat off-ramp / on-ramp (mainnet) |
| `CHAINRAILS_API_KEY` | Inbound crypto + fiat on-ramp |
| `NEXT_PUBLIC_RELAY_APP_ID` | Optional Relay volume attribution |

Set `NEXT_PUBLIC_NETWORK=testnet` or `mainnet` to switch the chain registry app-wide.

## Scripts

```bash
npm run dev        # local Next.js dev server
npm run build      # production build
npm run start      # production server
npm run lint       # ESLint
npm run typecheck  # TypeScript
npm run check      # format + lint + typecheck
```

## API routes

| Route | Purpose |
| ----- | ------- |
| `POST /api/chat` | Multi-turn assistant → structured flow handoff |
| `POST /api/intent` | Legacy single-shot NL → structured intent (dashboard / tooling) |
| `POST /api/router` | Rail selection + quote endpoint or inline CCTP fees |
| `POST /api/quote` | Relay quote and execution steps |
| `GET /api/cctp/attestation` | Poll Circle Iris for CCTP attestation |
| `GET /api/cctp/fees` | CCTP burn-fee quote per chain pair |
| `POST /api/chainrails/quote` | Chainrails best-across-bridges quote |
| `POST /api/paycrest/order` | Create off-ramp or on-ramp order |
| `GET /api/paycrest/order/:id` | Poll order status |
| `GET /api/paycrest/orders` | List orders by refund wallet address |
| `GET /api/paycrest/rate` | Public unit rate estimate |
| `GET /api/paycrest/institutions` | Payout institutions for a fiat currency |
| `POST /api/paycrest/verify-account` | Resolve account holder name |

Handler implementations live under `src/app/api/`. Example request bodies for local testing can be kept in a personal REST Client file (not committed).

## Architecture

High-level rail roles:

| Rail | Role |
| ---- | ---- |
| **Chainrails** | Crypto inbound + fiat on-ramp |
| **CCTP v2** | USDC ↔ USDC cross-chain |
| **Relay** | Non-USDC outbound, swaps, long-tail chains |
| **Paycrest** | Fiat payout to bank / mobile money |

See [ARCHITECTURE.md](./ARCHITECTURE.md) for phased rollout, constraints, and file-level map.

## Contributing

Contributions are welcome — especially rail integrations, corridor UX, and test coverage.

1. Fork the repo and create a branch from `main`
2. Run `npm run check` before opening a PR
3. Keep provider keys server-side; do not commit `.env` or local API scratch files
4. Update README and `ARCHITECTURE.md` when you add or change a route or rail

Open an issue first for large architectural changes.

## Security

Do not open public issues for sensitive vulnerabilities. Report security concerns privately to the maintainers.

This app moves real funds on mainnet when configured with production API keys. Review Paycrest and Relay docs, test with small amounts, and never commit secrets.

## License

[MIT](./LICENSE) — Copyright (c) 2026 Railglide contributors.
