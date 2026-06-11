# Architecture & roadmap

This document complements [`README.md`](README.md): the README describes **what runs in the repo today** (Relay-centric testnet demo). This file describes the **target multi-rail product** (Chainrails, CCTP, Relay, Paycrest), constraints, and phased rollout. Use both together—nothing here invalidates the README until corresponding code lands.

---

## How this fits the README

|                     | README (today)                     | This doc (target)                                              |
| ------------------- | ---------------------------------- | -------------------------------------------------------------- |
| **Bridge / quotes** | Relay API, EVM testnets + Starknet | Relay retained for outbound edges + quotes; CCTP for USDC↔USDC |
| **AI intent**       | `/api/intent`, loose parsing       | Structured outputs + route planner                             |
| **Starknet**        | AutoSwappr + server-involved flows | Client-signed swaps; drop server-held keys                     |
| **Security stance** | Documents server-side key handling | Target: no server-held signing keys                            |

---

## Product vision

**Stablecoin in from anywhere, fiat or token out to anywhere.**

Users describe intent in plain language or a form (for example: send local fiat to mobile money, or move USDC across chains). The app picks a rail without exposing provider plumbing.

**Differentiator:** commoditized bridges/swaps plus **fiat payout to supported local corridors** (for example via Paycrest). That payout leg is not interchangeable with generic bridging.

### Who it serves

**Phase 1 — primary**

- Users receiving stablecoins (employer, family, clients) who want **NGN, KES, GHS, UGX, XOF**, etc., in bank or mobile-money accounts.
- Sources may be CEX balances, self-custody wallets, or other chains.

**Phase 2+ — secondary**

- Cross-chain DeFi users (USDC across major L1/L2 networks).
- SMB stablecoin payroll into local payout corridors.
- Merchants settling crypto receipts to fiat.

### Constraints (what we are not claiming)

- **Regulatory / KYC:** corridors and limits depend on providers; app-level KYC may be needed above thresholds (see backlog).
- **Chainrails testnet:** multi-token inbound funding and fiat on-ramp are **mainnet-only** for realistic testing; testnet sessions are effectively **USDC-only**.
- **Single-provider risk:** Paycrest is the first fiat payout rail; alternate rails belong in backlog, not in “already shipped.”

---

## The four rails

High-level roles:

| Rail               | Role                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **Chainrails**     | Crypto **inbound** + fiat **on-ramp**; settles toward configured settlement chain (for example USDC on Base).            |
| **Circle CCTP v2** | **USDC ↔ USDC** across domains when destination token stays USDC.                                                        |
| **Relay**          | Non-USDC outbound, Bitcoin, fast quotes, same-chain swaps, executor when wallet is already connected; optional fallback. |
| **Paycrest**       | **Fiat off-ramp** (USDC → bank / mobile money) and **on-ramp** (fiat → USDC) via the same Sender API for supported corridors. Chainrails remains fallback on-ramp. |

**Chainrails inbound scope (reference):** intent flows may fund from multiple assets (for example USDC, USDT, DAI, ETH, WETH, and chain-specific lists) across listed networks; internal bridge/swap lands as USDC on the settlement chain. Fiat on-ramp coverage is provider-defined (many countries). Exact lists live in provider docs—not duplicated here so this table stays readable.

### When Relay still wins (outbound)

After inbound settles to USDC on the app balance, **outbound** routing uses Relay where CCTP or Paycrest do not apply:

| Scenario                         | Why Relay                                                                   |
| -------------------------------- | --------------------------------------------------------------------------- |
| USDC → non-USDC on another chain | CCTP is USDC-only; Relay does bridge + swap in one intent.                  |
| Destination Bitcoin              | Relay supports BTC legs; others in this stack do not.                       |
| Starknet / Solana non-USDC       | Matches Relay executor + SDK wiring.                                        |
| Quote comparison                 | Fast granular quotes (fees, ETA, slippage) for “cheapest route” UX.         |
| Power users                      | Step executor can sign from connected wallet without intent-address bounce. |
| Same-chain swaps                 | Via Relay instead of a separate aggregator.                                 |
| Resilience                       | Optional fallback when another rail is degraded.                            |

**One-line summary:** Chainrails → inbound; CCTP → USDC↔USDC outbound; Paycrest → fiat outbound; Relay → other outbound + quotes + optional fallback.

### Route planner (decision sketch)

```javascript
intent direction?
├── fiat → USDC              → Chainrails ramp API
├── crypto → USDC (settlement) → Chainrails session + PaymentModal
├── USDC → fiat (bank / MoMo) → ensure Paycrest-supported chain → Paycrest order
└── outbound crypto
        ├── USDC && cross-chain → CCTP v2
        ├── destination Bitcoin → Relay
        ├── token ≠ USDC       → Relay
        └── same-chain swap    → Relay
```

---

## System architecture (target)

```javascript
┌──────────────────────────────────────────────────────────────┐
│  UI: Next.js + RainbowKit + Starknet React                   │
│  - Intent (NL) + structured form fallback                    │
│  - PaymentModal slot (Chainrails)                            │
│  - Status timeline (deposit → bridge → payout)               │
└──────────────────────┬───────────────────────────────────────┘
                       │
              ┌────────▼────────┐
              │ Intent layer    │   /api/intent
              │ (structured AI) │   strict JSON schema + alias map
              └────────┬────────┘
                       │
              ┌────────▼────────┐
              │ Route planner   │   /api/route
              │ Chainrails |    │   pure function over registry
              │ CCTP | Relay |  │   rail, legs[], fee estimates
              │ Paycrest        │
              └────────┬────────┘
                       │
   ┌───────────────────┼──────────────────┬───────────────────┐
   ▼                   ▼                  ▼                   ▼
Chainrails          CCTP v2             Relay              Paycrest
session +           burn+attest+mint    quote → execute    sender API
PaymentModal        (client signs)                       (server order +
                                                          client funds)
   │                   │                  │                   │
   └───────────────────┴───────┬──────────┴───────────────────┘
                               │
                       ┌───────▼────────┐
                       │ Status tracker │   websocket / polling
                       │ normalises    │   single user timeline
                       │ per-rail APIs │
                       └────────────────┘
```

### Signing & custody (target vs README today)

**Target:** remove server-held chain keys (`ARGENT_PRIVATE_KEY`-style paths). Signatures come from the user wallet (RainbowKit / Argent-Braavos / Phantom as applicable). Server keeps provider API keys and read-only RPC configuration only—aligned with README’s eventual security story once migration lands.

---

## Network mode (testnet ⇄ mainnet)

Single flag drives registry and helpers:

```javascript
NEXT_PUBLIC_NETWORK=testnet   # | mainnet
```

| Rail       | Testnet                                           | Mainnet                        |
| ---------- | ------------------------------------------------- | ------------------------------ |
| Chainrails | Sessions + manual triggers; **USDC-only** funding | Full token support + fiat ramp |
| CCTP       | Sepolia family / Fuji / Amoy-style domains        | Production domains             |
| Relay      | Wired (`utils/relay/testnet.ts`)                  | `utils/relay/mainnet.ts`       |
| Paycrest   | Sandbox + test beneficiaries                      | Live API + provider KYC        |
| Wallets    | Testnet chains in RainbowKit                      | Mainnet chains                 |

Centralise chain lists in something like `src/config/network.ts` instead of scattering `SUPPORTED_CHAINS`. Default **`testnet`** until mainnet providers are funded and a small live path is verified.

---

## AI / intent layer

**Today (repo):**

- `src/app/api/chat/route.ts` — multi-turn chat; each turn returns a `ChatReply` with optional `launch: FlowLaunch` when ready.
- `src/assistant/productRules.ts` — product constraints (USDC/USDT settlement, swap-then-cashout, amount optional in chat).
- `src/app/components/arc/AssistantChat.tsx` — describe-flow UI; `launchFlow()` saves `savePendingLaunch()` then navigates.
- `src/app/api/intent/route.ts` — legacy single-shot parser (dashboard).

**Type progression:** `ChatMessage` → `ChatReply` → `FlowLaunch` (pending) → guided flow → `Intent` (quoted) → execution. `Intent` is never used for chat routing.

**Later — assistant scope:** chained swap→cashout auto-continuation, recurring sends, quote-only comparisons across rails, spend summaries.

---

## Phased roadmap

### Phase 0 — Cleanup (week 1)

Foundation only; no user-facing features.

- [x] Remove `ARGENT_PRIVATE_KEY` and server-side Starknet swap path
- [x] Migrate `api/intent/route.js` → `route.ts`
- [x] Add `src/config/network.ts`; dedupe chains across `quote/route.ts`, `SwapInterface.tsx`, `rainbowKitConfig.ts`
- [x] Trim dead routes from registry until executable again
- [ ] Delete mock same-chain swap rates
- [x] Add `NEXT_PUBLIC_NETWORK` (default `testnet`)
- [x] Tighten intent prompt via structured outputs

### Phase 1 — Local payout MVP (weeks 2–3)

- [ ] Chainrails session API + `<PaymentModal />` on deposit UI
- [ ] Paycrest order / rate / status APIs
- [ ] Recipient capture per corridor (bank / mobile money)
- [ ] E2E: Chainrails → USDC on Base → Paycrest → fiat
- [ ] Status timeline UI
- [ ] Sandbox proof, then mainnet toggle

### Phase 2 — Cross-chain outbound (weeks 4–5)

- [ ] CCTP v2 for USDC↔USDC
- [ ] Relay outbound for non-USDC / exotic legs (reuse cleaned executor)
- [ ] Quote comparison for assistant flows
- [ ] Route planner implementing the decision sketch above
- [ ] Starknet outbound via client-signed flows

### Phase 3 — Local payout UX (weeks 6+)

- [ ] Phone-first recipients (Opay, M-Pesa, Moniepoint, MTN MoMo, …)
- [ ] Localisation for priority launch markets
- [ ] PWA / low-connectivity-friendly status
- [ ] WhatsApp or similar distribution experiments
- [ ] Recurring payments; bill pay integrations; reverse on-ramp; yield on idle balance; receipts—see backlog for detail

---

## Backlog (non-blocking ideas)

- Rate lock windows against FX drift
- Batch payouts (payroll)
- App-level Travel Rule / KYC beyond provider defaults
- Telegram mini-app parity
- Referral attribution
- Dispute / reversal UX + ops tooling
- Merchant SDK (`<PayWithSwapChain />`)
- Alternate off-ramp providers (Yellow Card, Bitnob, FonBNK, …)
- SMB treasury (Safe, exports)
- Relay behind feature flag as inbound fallback when Chainrails degrades

---

## File-level cleanup map

| Location                               | Action                                              |
| -------------------------------------- | --------------------------------------------------- |
| `src/app/api/intent/route.js`          | → `.ts`, structured outputs                         |
| `src/app/api/quote/route.ts`           | Extract registry; add CCTP path                     |
| `src/app/api/starknet-swap/route.ts`   | Remove server path; client-side signing             |
| `src/hooks/useRelayExecutor.ts`        | Moved to `src/hooks/`; slim to outbound-only later  |
| `src/utils/*` (was `utils.ts`)         | Split by domain: amount, gas, balance, icons, solana |
| `src/types/*` (was `interfaces.ts`)    | Shared types extracted into a domain-split folder   |
| `src/app/components/SwapInterface.tsx` | Split panels: deposit / off-ramp / bridge           |
| `src/app/components/AutoSwap.tsx`      | Client-signed Starknet                              |
| `src/app/dashboard/transfer/page.tsx`  | Evolve into off-ramp page                           |
| _new_ `src/config/network.ts`          | Single network + chain source of truth              |
| _new_ `src/rails/*.ts`                 | `chainrails`, `cctp`, `relay`, `paycrest`, `router` |

---

## Environment variables (target)

```bash
# Universe
NEXT_PUBLIC_NETWORK=testnet

# Wallet
NEXT_PUBLIC_WALLET_CONNECT_ID=

# AI
OPENAI_API_KEY=

# Chainrails
CHAINRAILS_API_KEY=
CHAINRAILS_BASE_URL=

# Paycrest
PAYCREST_CLIENT_ID=
PAYCREST_CLIENT_SECRET=
PAYCREST_WEBHOOK_SECRET=

# Circle (CCTP attestation flows as needed)
CIRCLE_API_KEY=

# Relay (optional app / referrer id)
NEXT_PUBLIC_RELAY_APP_ID=

# Optional RPCs
NEXT_PUBLIC_BASE_RPC_URL=
NEXT_PUBLIC_STARKNET_RPC_URL=
```

`ARGENT_PRIVATE_KEY` intentionally omitted in the target model.

---

## Doc maintenance

When README and implementation diverge from this roadmap, update **either** the README **or** this file in the same PR so “today vs target” stays honest—especially API paths and security wording.
