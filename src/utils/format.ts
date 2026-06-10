/**
 * Number & money formatting helpers.
 *
 * Pure display formatting — thousands separators, token amounts, and
 * local-currency symbols. No chain or network access.
 */

/** Local-currency symbols for the supported payout corridors. */
export const FIAT_SYMBOLS: Record<string, string> = {
  NGN: "₦",
  KES: "KSh",
  GHS: "₵",
  UGX: "USh",
  XOF: "CFA",
  ZMW: "ZK",
  TZS: "TSh",
  ZAR: "R",
};

/** "10000" → "10,000". Accepts a number or numeric string. */
export function formatNumber(
  value: number | string,
  maxFractionDigits = 2
): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: maxFractionDigits });
}

/** "10000", "USDC" → "10,000 USDC". */
export function formatToken(
  value: number | string,
  symbol: string,
  maxFractionDigits = 4
): string {
  return `${formatNumber(value, maxFractionDigits)} ${symbol}`;
}

/** "NGN", 136490 → "₦136,490.00" (falls back to "NGN 136,490.00"). */
export function formatFiat(code: string, amount: number | string): string {
  const sym = FIAT_SYMBOLS[code.toUpperCase()];
  const n = formatNumber(amount, 2);
  return sym ? `${sym}${n}` : `${code} ${n}`;
}
