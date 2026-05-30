# Swap Chain

Swap Chain is a global stablecoin routing app: stablecoin, token, or fiat in; local currency or another chain out.

The current codebase is a Next.js app with a multi-rail router (CCTP, Chainrails, Relay, Paycrest), a structured AI intent parser, a LiFi-backed token + chain registry, and an in-app swap UI that drives real on-chain execution for USDC ↔ USDC routes via Circle CCTP v2.

## Current features

- **Swap UI at `/app`** — pick chain + token + amount, or describe the transfer in plain English; both paths produce the same quote and execution flow
- **Multi-rail router** — `/api/router` picks CCTP for USDC↔USDC across supported chains, Chainrails for broader crypto routes, Relay as the catch-all, and Paycrest for fiat off-ramp
- **CCTP v2 end-to-end** — approve → burn → poll Circle Iris for attestation → switch chain → mint, all signed by the connected wallet
- **AI intent parser** — `/api/intent` extracts a structured intent (action, chains, tokens, amount, recipient, fiat currency) from natural language using OpenAI-compatible providers (defaults to GitHub Models)
- **Token + chain registry** — LiFi catalog filtered to the chains the router actually supports; logos and metadata from LiFi, falls back to the local registry on testnet
- **Wallet connection** — RainbowKit + wagmi, with connect/disconnect, account switcher, and an honest "connect to continue" guard on the confirm step
- **Network mode** — `NEXT_PUBLIC_NETWORK=testnet|mainnet` flips chains, tokens, and rail addresses across the whole app from one switch

## Product Direction

The brand should stay global. The first payout corridors can be regional, but the name and top-level promise should not be tied to one geography.

Target rail split:

- Chainrails: inbound crypto funding and fiat on-ramp
- CCTP v2: USDC-to-USDC cross-chain routes
- Relay: non-USDC outbound, long-tail routes, quote execution
- Paycrest: local fiat payout to supported bank and mobile-money recipients

See `ARCHITECTURE.md` for the phased roadmap.

## Setup

```bash
npm install
cp env.example .env.local
npm run dev
```

Open:

```bash
http://localhost:3000
```

Required for wallet UX:

```bash
NEXT_PUBLIC_WALLET_CONNECT_ID=your_walletconnect_project_id
```

Required for AI intent extraction:

```bash
OPENAI_API_KEY=your_openai_or_compatible_api_key
```

`OPENAI_BASE_URL` is optional. If omitted, the app defaults to the configured GitHub Models-compatible endpoint in `src/app/api/intent/route.ts`.

## Scripts

```bash
npm run dev        # local Next.js dev server
npm run build      # production build
npm run lint       # ESLint
npm run typecheck  # TypeScript check
npm test           # currently aliases typecheck
npm run check      # lint + typecheck
```

## API routes

| Route | Purpose |
| ----- | ------- |
| `POST /api/intent` | Natural-language → structured intent (action, chains, tokens, amount, recipient, fiat). Uses OpenAI-compatible LLM. |
| `POST /api/router` | Multi-rail router. Picks `cctp` / `chainrails` / `relay` / `paycrest` and returns an inline quote (for CCTP) or a `quoteEndpoint` for the others. |
| `POST /api/quote` | Relay quote + execution steps. Used by the router when it picks Relay. |
| `GET /api/cctp/attestation` | Polls Circle Iris for a CCTP v2 attestation by burn tx hash. |
| `GET /api/cctp/fees` | Live CCTP burn-fee quote per src → dst pair. |
| `POST /api/chainrails/quote` | Chainrails best-across-bridges quote. Requires `CHAINRAILS_API_KEY`. |
| `POST /api/paycrest/order` | Paycrest fiat off-ramp order. Mainnet-only, requires `PAYCREST_API_KEY`. |

See `src/app/api/api.rest` for example request bodies you can fire from the VS Code REST Client extension.

## Network Mode

`NEXT_PUBLIC_NETWORK` controls the active registry:

```bash
NEXT_PUBLIC_NETWORK=testnet
# or
NEXT_PUBLIC_NETWORK=mainnet
```

Default is `testnet`.

## Development Notes

- Add chains and tokens in `src/config/network.ts`.
- Do not add server-held wallet private keys.
- Keep provider-specific integrations behind API modules or rail modules.
- Keep README and `ARCHITECTURE.md` aligned when a route or rail changes.

