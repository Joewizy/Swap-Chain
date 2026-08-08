/**
 * Local record of Chainrails ramp orders the user created in this browser.
 *
 * Chainrails' list endpoint is scoped to our API key (account-wide), so it
 * can't be shown per-user. Until we persist orders server-side keyed by wallet
 * (see todo/todo.md — "Chainrails order history"), we remember the ids the user
 * created here and re-fetch each one's live status for the History screen.
 */

export type TrackedRampOrder = {
  id: string;
  direction: "onramp" | "offramp";
  /** Delivery/source chain label, e.g. "Solana". */
  chainLabel: string;
  /** e.g. "1.416 USDC". */
  cryptoLabel: string;
  /** e.g. "2,062 NGN". */
  fiatLabel?: string;
  /** The exact amount to deposit for a sell, e.g. "5.0275 USDC". Captured at
   *  creation so a resumed order shows the right figure without the quote. */
  depositLabel?: string;
  /** Recipient (on-ramp) or sender (off-ramp) address. */
  address?: string;
  createdAt: number;
};

const KEY = "chainrails:orders";
const MAX = 30;

export function loadTrackedRampOrders(): TrackedRampOrder[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as TrackedRampOrder[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** A single tracked order by id — used to reopen a Sell order from the URL. */
export function getTrackedRampOrder(id: string): TrackedRampOrder | null {
  return loadTrackedRampOrders().find((o) => o.id === id) ?? null;
}

/** Record a newly-created order (newest first, deduped by id, capped). */
export function trackRampOrder(order: TrackedRampOrder): void {
  try {
    const existing = loadTrackedRampOrders().filter((o) => o.id !== order.id);
    const next = [order, ...existing].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Non-fatal: a browser without storage just won't have local history.
  }
}
