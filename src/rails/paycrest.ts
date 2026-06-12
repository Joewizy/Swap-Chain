/**
 * Paycrest rail — fiat off-ramp and on-ramp via the v2 Sender API.
 *
 * Pure module: no I/O, safe to import from client or server. Holds the
 * single source of truth the intent parser, the API route and the UI
 * all share — supported fiat currencies, network slugs, the env gate
 * and the order request/response types.
 *
 * Both directions use the same endpoint (POST /v2/sender/orders) and the
 * same server-only API key; the actual fetch lives in /api/paycrest/order.
 *
 * Docs: https://docs.paycrest.io/implementation-guides/sender-api-integration
 * Note: Paycrest runs on mainnet only — no sandbox; test with small amounts.
 *
 * See ARCHITECTURE.md §"Phase 1 — Local payout MVP".
 */

import type { ChainId } from "@/config/network";

/** Paycrest Sender API host. Auth is the `API-Key` request header. */
export const PAYCREST_BASE_URL = "https://api.paycrest.io";

/** Fiat currencies Paycrest supports for payout and on-ramp. */
export const PAYCREST_FIAT = [
  "NGN",
  "KES",
  "GHS",
  "UGX",
  "XOF",
  "ZMW",
  "TZS",
  "ZAR",
] as const;

export type PaycrestFiat = (typeof PAYCREST_FIAT)[number];

/** Case-insensitive check + type guard for a supported fiat currency. */
export function isPaycrestFiat(code: string): code is PaycrestFiat {
  return (PAYCREST_FIAT as readonly string[]).includes(code.toUpperCase());
}

/**
 * Turns a raw Paycrest error into something a non-technical user can act on.
 * Falls back to the original message (minus the noisy validation prefix).
 */
export function humanizePaycrestError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("no provider available")) {
    return "No provider can fill an order this size right now. Try a smaller amount, or check back shortly.";
  }
  if (m.includes("rate validation") || m.includes("no rate")) {
    return "We couldn't lock a rate for that amount — try a different amount.";
  }
  if (m.includes("insufficient") || m.includes("minimum")) {
    return "That amount is outside the supported range for this payout — try a different amount.";
  }
  // Strip the noisy "Failed to validate payload [X]" prefix if present.
  let cleaned = message
    .replace(/^failed to validate payload\s*\[[^\]]*\]\s*/i, "")
    .trim();
  // Never surface vendor names in user-facing copy.
  cleaned = cleaned
    .replace(/\bpaycrest\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .trim();
  return cleaned || "Something went wrong — try again.";
}

/** Stablecoins Paycrest accepts. */
export type PaycrestToken = "USDC" | "USDT";

export type PaycrestDirection = "offramp" | "onramp";

// ---------------------------------------------------------------------------
// Networks — map our app ChainId to Paycrest's network slug.
// ---------------------------------------------------------------------------

export const PAYCREST_NETWORK_SLUGS: Partial<Record<ChainId, string>> = {
  base: "base",
  arbitrum: "arbitrum-one",
  polygon: "polygon",
  bnb: "bnb-smart-chain",
};

/** Paycrest network slug for a chain, or null when unsupported. */
export function paycrestNetworkSlug(chainId: ChainId): string | null {
  return PAYCREST_NETWORK_SLUGS[chainId] ?? null;
}

/** Reverse of paycrestNetworkSlug: "base" → "base", "arbitrum-one" → "arbitrum". */
export function chainIdFromPaycrestSlug(slug: string): ChainId | null {
  const entry = Object.entries(PAYCREST_NETWORK_SLUGS).find(
    ([, s]) => s === slug
  );
  return entry ? (entry[0] as ChainId) : null;
}

/** A payout institution (bank or mobile-money) from Paycrest's catalogue. */
export interface PaycrestInstitution {
  name: string;
  /** Code passed as recipient.institution, e.g. "GTBINGLA", "OPAYNGPC". */
  code: string;
  type: "bank" | "mobile_money";
}

/**
 * True when the Paycrest API key is present in the server env. Returns
 * false on the client (the key is server-only) — call this inside the
 * API route, not in the hook.
 */
export function isPaycrestConfigured(): boolean {
  return Boolean(process.env.PAYCREST_API_KEY);
}

// ---------------------------------------------------------------------------
// Order types — request/response shapes the hooks and routes agree on.
// ---------------------------------------------------------------------------

/** Bank or mobile-money account (payout destination or fiat refund account). */
export interface PaycrestRecipient {
  institution: string;
  accountIdentifier: string;
  accountName: string;
  memo?: string;
}

/** Fiat account Paycrest refunds to if an on-ramp order fails. */
export type PaycrestRefundAccount = PaycrestRecipient;

/** Off-ramp: stablecoin → fiat. */
export interface PaycrestOfframpRequest {
  direction?: "offramp";
  amount: string;
  token: PaycrestToken;
  /** Paycrest network slug, e.g. "base". */
  network: string;
  refundAddress: `0x${string}`;
  currency: PaycrestFiat;
  recipient: PaycrestRecipient;
  reference?: string;
}

/** On-ramp: fiat → stablecoin. */
export interface PaycrestOnrampRequest {
  direction: "onramp";
  amount: string;
  /** Defaults to "fiat" when omitted. */
  amountIn?: "fiat" | "crypto";
  fiatCurrency: PaycrestFiat;
  refundAccount: PaycrestRefundAccount;
  token: PaycrestToken;
  network: string;
  recipientAddress: `0x${string}`;
  reference?: string;
}

/** Flat order body the app posts to /api/paycrest/order. */
export type PaycrestOrderRequest =
  | PaycrestOfframpRequest
  | PaycrestOnrampRequest;

/** Paycrest order lifecycle. Mirrors the status field Paycrest returns. */
export type PaycrestOrderStatus =
  | "initiated"
  | "pending"
  | "processing"
  | "validated"
  | "settling"
  // Terminal success: provider has paid the recipient (and settled on-chain).
  | "fulfilled"
  | "settled"
  | "refunded"
  | "expired";

/** A created order, normalised from the Paycrest response. */
export interface PaycrestOrder {
  id: string;
  status: PaycrestOrderStatus;
  direction: PaycrestDirection;
  /** Crypto amount (off-ramp: sent; on-ramp: received). */
  amount: string;
  /** Display currency — fiat code for off-ramp, token symbol for on-ramp. */
  currency: string;
  /** Locked exchange rate when returned by Paycrest. */
  rate?: string;
  /** Off-ramp: on-chain address the user funds with stablecoin. */
  receiveAddress?: string;
  /** On-ramp: virtual account / mobile number to deposit fiat into. */
  depositInstitution?: string;
  depositAccountIdentifier?: string;
  depositAccountName?: string;
  /** On-ramp: exact fiat amount the user must transfer. */
  amountToTransfer?: string;
  depositCurrency?: string;
  /** Deadline for funding (off-ramp crypto or on-ramp fiat). */
  validUntil?: string;
  /** Amount of the deposit received so far (for partial-deposit progress). */
  amountPaid?: string;
  /** Amount returned to the refund address (refunds / overpayment). */
  amountReturned?: string;
  /** Settlement progress, 0–100. */
  percentSettled?: string;
  /** Sender (app) fee, if any. */
  senderFee?: string;
  /** Network / processing fee, if any. */
  transactionFee?: string;
  /** Settlement / on-chain tx hash, once available. */
  txHash?: string;
  /** On-ramp: wallet that receives stablecoin. */
  recipientAddress?: string;
  /** On-ramp: destination network slug, e.g. "base". */
  recipientNetwork?: string;
  createdAt: string;
  /** Last update — settlement time once fulfilled. */
  updatedAt?: string;
  raw?: unknown;
}

/**
 * Normalises a Paycrest v2 order payload into our PaycrestOrder shape.
 * Used by POST and GET /api/paycrest/order routes.
 */
export function normalizePaycrestOrder(
  payload: Record<string, unknown>,
  raw?: unknown
): PaycrestOrder {
  const source = payload.source as { type?: string } | undefined;
  const destination = payload.destination as
    | { type?: string; currency?: string }
    | undefined;
  const direction: PaycrestDirection =
    source?.type === "fiat" ? "onramp" : "offramp";

  const providerAccount = payload.providerAccount as
    | Record<string, unknown>
    | undefined;

  const fiatCurrency =
    direction === "onramp"
      ? typeof source?.type === "string"
        ? String(
            (source as { currency?: string }).currency ??
              destination?.currency ??
              ""
          ).toUpperCase()
        : ""
      : String(
          destination?.currency ??
            (payload.currency as string | undefined) ??
            ""
        ).toUpperCase();

  const cryptoCurrency =
    direction === "onramp"
      ? String(
          (destination as { currency?: string } | undefined)?.currency ?? ""
        )
      : String(
          (source as { currency?: string } | undefined)?.currency ?? ""
        );

  return {
    id: String(payload.id),
    status: (payload.status as PaycrestOrderStatus) ?? "initiated",
    direction,
    amount:
      typeof payload.amount === "string" ? payload.amount : String(payload.amount ?? ""),
    currency: direction === "onramp" ? cryptoCurrency : fiatCurrency,
    rate: typeof payload.rate === "string" ? payload.rate : undefined,
    receiveAddress:
      direction === "offramp" &&
      typeof providerAccount?.receiveAddress === "string"
        ? providerAccount.receiveAddress
        : undefined,
    depositInstitution:
      direction === "onramp" &&
      typeof providerAccount?.institution === "string"
        ? providerAccount.institution
        : undefined,
    depositAccountIdentifier:
      direction === "onramp" &&
      typeof providerAccount?.accountIdentifier === "string"
        ? providerAccount.accountIdentifier
        : undefined,
    depositAccountName:
      direction === "onramp" &&
      typeof providerAccount?.accountName === "string"
        ? providerAccount.accountName
        : undefined,
    amountToTransfer:
      direction === "onramp" &&
      typeof providerAccount?.amountToTransfer === "string"
        ? providerAccount.amountToTransfer
        : undefined,
    depositCurrency:
      direction === "onramp" &&
      typeof providerAccount?.currency === "string"
        ? providerAccount.currency
        : undefined,
    validUntil:
      typeof providerAccount?.validUntil === "string"
        ? providerAccount.validUntil
        : undefined,
    amountPaid: asString(payload.amountPaid),
    amountReturned: asString(payload.amountReturned),
    percentSettled: asString(payload.percentSettled),
    senderFee: asString(payload.senderFee),
    transactionFee: asString(payload.transactionFee),
    txHash: extractSettlementTxHash(payload),
    recipientAddress:
      direction === "onramp"
        ? extractCryptoRecipientAddress(destination)
        : undefined,
    recipientNetwork:
      direction === "onramp"
        ? extractCryptoRecipientNetwork(destination)
        : undefined,
    createdAt:
      typeof payload.createdAt === "string"
        ? payload.createdAt
        : typeof payload.timestamp === "string"
          ? payload.timestamp
          : new Date().toISOString(),
    updatedAt:
      typeof payload.updatedAt === "string" ? payload.updatedAt : undefined,
    raw: raw ?? payload,
  };
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function extractCryptoRecipientAddress(
  destination: { type?: string; recipient?: unknown } | undefined
): string | undefined {
  if (!destination || destination.type !== "crypto") return undefined;
  const recipient = destination.recipient as { address?: string } | undefined;
  return typeof recipient?.address === "string" ? recipient.address : undefined;
}

function extractCryptoRecipientNetwork(
  destination: { type?: string; recipient?: unknown } | undefined
): string | undefined {
  if (!destination || destination.type !== "crypto") return undefined;
  const recipient = destination.recipient as { network?: string } | undefined;
  return typeof recipient?.network === "string" ? recipient.network : undefined;
}

const PAYCREST_CREDITED_STATUSES = new Set<PaycrestOrderStatus>([
  "pending",
  "processing",
  "validated",
  "settling",
  "fulfilled",
  "settled",
]);

function hasPaycrestTransactionLog(
  order: PaycrestOrder,
  statuses: string[]
): boolean {
  const raw = order.raw;
  if (!raw || typeof raw !== "object") return false;
  const root = raw as Record<string, unknown>;
  const data =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : root;
  const logs = data.transactionLogs;
  if (!Array.isArray(logs)) return false;
  const want = new Set(statuses);
  return logs.some((entry) => {
    const o = (entry ?? {}) as Record<string, unknown>;
    const status = typeof o.status === "string" ? o.status : "";
    return want.has(status);
  });
}

/** Paycrest has seen and credited the crypto deposit (source of truth). */
export function paycrestDepositCredited(order: PaycrestOrder): boolean {
  if (Number(order.amountPaid ?? 0) > 0) return true;
  if (PAYCREST_CREDITED_STATUSES.has(order.status)) return true;
  return hasPaycrestTransactionLog(order, ["crypto_deposited"]);
}

/** Provider is disbursing fiat — past the "waiting for deposit" stage. */
export function paycrestPayoutInFlight(order: PaycrestOrder): boolean {
  if (Number(order.amountPaid ?? 0) > 0) return true;
  return (
    order.status === "pending" ||
    order.status === "processing" ||
    order.status === "validated" ||
    order.status === "settling"
  );
}

/** Funding window closed with no credited deposit. */
export function paycrestFundingWindowClosed(order: PaycrestOrder): boolean {
  if (order.status === "expired" || order.status === "refunded") return true;
  if (paycrestDepositCredited(order)) return false;
  if (!order.validUntil) return false;
  return Date.now() > new Date(order.validUntil).getTime();
}

/** Compact row for History — derived from a v2 list/detail order payload. */
export interface PaycrestHistoryOrder {
  id: string;
  direction: PaycrestDirection;
  status: string;
  /** Crypto amount (off-ramp: sent; on-ramp: received). */
  amount: string;
  token: string;
  network: string;
  rate: string | null;
  /** Fiat currency code (NGN, etc.). */
  currency: string | null;
  /** Fiat the recipient gets (off-ramp) or the user deposited (on-ramp). */
  fiatAmount: number | null;
  recipientName: string | null;
  institution: string | null;
  accountIdentifier: string | null;
  /** On-ramp: wallet that receives stablecoin. */
  recipientAddress: string | null;
  /** Off-ramp: on-chain deposit address. */
  receiveAddress: string | null;
  /** On-ramp: virtual account to fund while order is open. */
  depositAccountIdentifier: string | null;
  refundInstitution: string | null;
  refundInstitutionName: string | null;
  refundAccountIdentifier: string | null;
  refundAccountName: string | null;
  txHash: string | null;
  createdAt: string | null;
}

/** True when the connected wallet is the refund (off-ramp) or recipient (on-ramp) address. */
export function orderMatchesWallet(
  payload: Record<string, unknown>,
  address: string
): boolean {
  const want = address.toLowerCase();
  const source = payload.source as Record<string, unknown> | undefined;
  const destination = payload.destination as Record<string, unknown> | undefined;

  if (source?.type === "crypto") {
    const refund = source.refundAddress;
    if (typeof refund === "string" && refund.toLowerCase() === want) {
      return true;
    }
  }
  if (destination?.type === "crypto") {
    const recipient = destination.recipient as { address?: string } | undefined;
    if (
      typeof recipient?.address === "string" &&
      recipient.address.toLowerCase() === want
    ) {
      return true;
    }
  }

  // Legacy v1 list shape (kept for safety).
  const recipient = (payload.recipient as Record<string, unknown>) ?? {};
  const legacy = [
    payload.refundAddress,
    payload.returnAddress,
    payload.fromAddress,
    recipient.address,
  ];
  return legacy.some(
    (c) => typeof c === "string" && c.toLowerCase() === want
  );
}

/** Normalises a v2 order payload into the History list shape. */
export function summarizePaycrestOrderForHistory(
  payload: Record<string, unknown>
): PaycrestHistoryOrder {
  const order = normalizePaycrestOrder(payload);
  const source = payload.source as Record<string, unknown> | undefined;
  const destination = payload.destination as Record<string, unknown> | undefined;
  const providerAccount = payload.providerAccount as
    | Record<string, unknown>
    | undefined;
  const fiatRecipient =
    destination?.type === "fiat"
      ? (destination.recipient as Record<string, unknown> | undefined)
      : undefined;
  const refundAccount =
    source?.type === "fiat"
      ? (source.refundAccount as Record<string, unknown> | undefined)
      : undefined;

  const network =
    order.direction === "onramp"
      ? (extractCryptoRecipientNetwork(
          destination as { type?: string; recipient?: unknown }
        ) ?? "")
      : String(
          (source as { network?: string } | undefined)?.network ??
            providerAccount?.network ??
            payload.network ??
            ""
        );

  const token =
    order.direction === "onramp"
      ? order.currency || "USDC"
      : String(
          (source as { currency?: string } | undefined)?.currency ?? "USDC"
        );

  const fiatCurrency =
    order.direction === "onramp"
      ? (order.depositCurrency ??
        String((source as { currency?: string } | undefined)?.currency ?? ""))
      : String(
          (destination as { currency?: string } | undefined)?.currency ?? ""
        );

  const fiatAmount =
    order.direction === "onramp" && order.amountToTransfer
      ? Number(order.amountToTransfer)
      : order.rate && order.amount
        ? Number(order.amount) * Number(order.rate)
        : null;

  return {
    id: order.id,
    direction: order.direction,
    status: order.status,
    amount: order.amount,
    token,
    network,
    rate: order.rate ?? null,
    currency: fiatCurrency || null,
    fiatAmount: Number.isFinite(fiatAmount as number) ? fiatAmount : null,
    recipientName:
      typeof fiatRecipient?.accountName === "string"
        ? fiatRecipient.accountName
        : null,
    institution:
      typeof fiatRecipient?.institutionName === "string"
        ? fiatRecipient.institutionName
        : typeof fiatRecipient?.institution === "string"
          ? fiatRecipient.institution
          : null,
    accountIdentifier:
      typeof fiatRecipient?.accountIdentifier === "string"
        ? fiatRecipient.accountIdentifier
        : null,
    recipientAddress: order.recipientAddress ?? null,
    receiveAddress: order.receiveAddress ?? null,
    depositAccountIdentifier: order.depositAccountIdentifier ?? null,
    refundInstitution:
      typeof refundAccount?.institution === "string"
        ? refundAccount.institution
        : null,
    refundInstitutionName:
      typeof refundAccount?.institutionName === "string"
        ? refundAccount.institutionName
        : null,
    refundAccountIdentifier:
      typeof refundAccount?.accountIdentifier === "string"
        ? refundAccount.accountIdentifier
        : null,
    refundAccountName:
      typeof refundAccount?.accountName === "string"
        ? refundAccount.accountName
        : null,
    txHash: order.txHash ?? null,
    createdAt: order.createdAt ?? null,
  };
}

/** Top-level txHash, or the latest non-empty hash from transactionLogs. */
function extractSettlementTxHash(payload: Record<string, unknown>): string | undefined {
  if (typeof payload.txHash === "string" && payload.txHash) {
    return payload.txHash;
  }
  const logs = payload.transactionLogs;
  if (!Array.isArray(logs)) return undefined;
  for (let i = logs.length - 1; i >= 0; i--) {
    const tx = (logs[i] as { tx_hash?: string })?.tx_hash;
    if (typeof tx === "string" && tx) return tx;
  }
  return undefined;
}
