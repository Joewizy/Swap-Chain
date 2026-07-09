/**
 * Shapes shared by the /dashboard analytics endpoint and its client page.
 * No server-only imports here so the client can import the types safely.
 */

export type OrderDirection = "onramp" | "offramp";

/** One order row in the dashboard table (PII kept to name + institution). */
export interface DashboardOrderRow {
  id: string;
  createdAt: string | null;
  /** onramp = Buy, offramp = Sell. */
  direction: OrderDirection;
  status: string;
  token: string;
  network: string;
  /** Crypto amount. */
  amount: string;
  /** Fiat currency code (NGN, KES…), when known. */
  currency: string | null;
  /** Fiat value of the order, when derivable. */
  fiatAmount: number | null;
  /** Your app fee on this order (token units) — revenue. */
  senderFee: number | null;
  recipientName: string | null;
  institution: string | null;
}

/** Settled fiat volume for one currency. */
export interface CurrencyVolume {
  currency: string;
  volume: number;
  count: number;
}

/** Settled crypto volume and your fee revenue for one token. */
export interface TokenVolume {
  token: string;
  volume: number;
  fees: number;
}

export interface DashboardSummary {
  totalOrders: number;
  /** Raw count per Paycrest status string. */
  byStatus: Record<string, number>;
  successful: number;
  failed: number;
  expired: number;
  pending: number;
  /** successful / (successful + failed + expired), or null when none terminal. */
  successRate: number | null;
  buyCount: number;
  sellCount: number;
  /** "How much is flowing" — settled fiat volume by currency. */
  settledFiatByCurrency: CurrencyVolume[];
  /** Settled crypto volume + your fees by token. */
  cryptoByToken: TokenVolume[];
  /** False when no order carried a senderFee (fee data not in list payloads). */
  hasFeeData: boolean;
  /** True when we hit the page cap and didn't read every order. */
  truncated: boolean;
}

export interface DashboardResponse {
  summary: DashboardSummary;
  orders: DashboardOrderRow[];
  /** The admin address the data was served to. */
  address: string;
}
