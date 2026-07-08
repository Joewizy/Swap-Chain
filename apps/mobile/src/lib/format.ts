/**
 * Fiat / money display helpers — mirrors web `utils/format.ts` for the corridors
 * Paycrest supports. Keep symbols in sync when adding a currency.
 */

const FIAT_SYMBOLS: Record<string, string> = {
  NGN: "₦",
  KES: "KSh",
  GHS: "₵",
  UGX: "USh",
  XOF: "CFA",
  ZMW: "ZK",
  TZS: "TSh",
  ZAR: "R",
};

/** Symbol shown before fiat amounts, e.g. NGN → "₦". */
export function fiatSymbol(code: string): string {
  return FIAT_SYMBOLS[code.toUpperCase()] ?? "";
}

/** "NGN", 136490 → "₦136,490" (falls back to "NGN 136,490"). */
export function formatFiat(code: string, amount: number | string): string {
  const num = typeof amount === "string" ? Number(amount) : amount;
  const n =
    typeof amount === "string" && !Number.isFinite(num)
      ? amount
      : num.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const sym = fiatSymbol(code);
  return sym ? `${sym}${n}` : `${code} ${n}`;
}
