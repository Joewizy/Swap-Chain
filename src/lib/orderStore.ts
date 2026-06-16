/**
 * Server-owned Paycrest order store (Upstash Redis).
 *
 * The client poller and Paycrest's API both describe an order's state, but
 * neither survives a closed tab: once the user leaves, polling stops and we
 * never learn the order settled. This store is the source of truth we control —
 * the webhook (fast path) and, later, a reconcile cron (backstop) write into it
 * so the app can show "your buy completed" even after the user walks away.
 *
 * Degrades to a no-op when Redis isn't configured (local dev): callers still
 * work, they just don't gain durable state. See todo.md "Phase 1 — Webhook +
 * store" and the four invariants (idempotency, signature, monotonic, reconcile).
 */
import { redis } from "@/lib/redis";
import {
  isPaycrestTerminalStatus,
  paycrestStatusRank,
  type PaycrestOrder,
  type PaycrestOrderStatus,
} from "@/rails/paycrest";

/** What we persist per order. The normalized `order` is already PII-light. */
export interface StoredPaycrestOrder {
  order: PaycrestOrder;
  /** Connected wallet this order belongs to (lowercased), when known. */
  walletAddress: string | null;
  /** Last webhook event that touched this record, e.g. "payment_order.settled". */
  event: string | null;
  /** When we last wrote this record (ISO). */
  updatedAt: string;
  /** When the order first reached a terminal state (ISO). */
  terminalAt?: string;
}

// Keep records around long enough to cover History and late reconciliation,
// but not forever — an order is uninteresting weeks after it settles.
const ORDER_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const EVENT_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days — covers Paycrest's retry window

const orderKey = (id: string) => `paycrest:store:order:${id}`;
const walletIndexKey = (address: string) => `paycrest:store:wallet:${address.toLowerCase()}`;
const eventKey = (eventId: string) => `paycrest:store:event:${eventId}`;

/**
 * Claims a webhook event id so the same delivery is processed once. Paycrest
 * retries deliveries and may send duplicates; returns true only for the first
 * caller. Without Redis there's no dedupe, so we process (true) and rely on the
 * upsert being monotonic anyway.
 */
export async function markWebhookEventSeen(eventId: string): Promise<boolean> {
  if (!redis) return true;
  const claim = await redis.set(eventKey(eventId), 1, {
    nx: true,
    ex: EVENT_TTL_SECONDS,
  });
  return claim !== null;
}

/**
 * Decides whether an incoming snapshot should replace the stored one. Enforces
 * the monotonic invariant: never move backwards in the lifecycle, and never
 * leave a terminal state for a non-terminal one. Same-rank snapshots fall back
 * to recency so a fresher payload (e.g. with a txHash) wins.
 */
function shouldReplace(prev: StoredPaycrestOrder, next: PaycrestOrder): boolean {
  const prevStatus = prev.order.status;
  const nextStatus = next.status;
  if (isPaycrestTerminalStatus(prevStatus) && !isPaycrestTerminalStatus(nextStatus)) {
    return false;
  }
  const prevRank = paycrestStatusRank(prevStatus);
  const nextRank = paycrestStatusRank(nextStatus);
  if (nextRank !== prevRank) return nextRank > prevRank;
  const prevAt = timeOf(prev.order.updatedAt ?? prev.updatedAt);
  const nextAt = timeOf(next.updatedAt);
  return nextAt >= prevAt;
}

function timeOf(iso: string | undefined): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

export interface UpsertResult {
  stored: StoredPaycrestOrder | null;
  /** True when this call advanced the record (new order or newer status). */
  changed: boolean;
}

/**
 * Idempotent, monotonic upsert of an order snapshot. Safe to call from the
 * webhook and from any reconcile/read path with a fresher payload.
 */
export async function upsertStoredOrder(
  order: PaycrestOrder,
  meta: { walletAddress?: string | null; event?: string | null } = {}
): Promise<UpsertResult> {
  if (!redis) return { stored: null, changed: false };

  const existing = await redis.get<StoredPaycrestOrder>(orderKey(order.id));
  if (existing && !shouldReplace(existing, order)) {
    return { stored: existing, changed: false };
  }

  const nowIso = new Date().toISOString();
  const becameTerminal = isPaycrestTerminalStatus(order.status);
  const record: StoredPaycrestOrder = {
    order,
    // Don't lose a wallet we already attributed if a later event omits it.
    walletAddress: meta.walletAddress ?? existing?.walletAddress ?? null,
    event: meta.event ?? existing?.event ?? null,
    updatedAt: nowIso,
    terminalAt: becameTerminal
      ? (existing?.terminalAt ?? nowIso)
      : existing?.terminalAt,
  };

  await redis.set(orderKey(order.id), record, { ex: ORDER_TTL_SECONDS });

  if (record.walletAddress) {
    const key = walletIndexKey(record.walletAddress);
    await redis.zadd(key, {
      score: timeOf(order.createdAt) || Date.now(),
      member: order.id,
    });
    await redis.expire(key, ORDER_TTL_SECONDS);
  }

  return { stored: record, changed: true };
}

/** Reads a single stored order, or null when absent / no store configured. */
export async function getStoredOrder(
  id: string
): Promise<StoredPaycrestOrder | null> {
  if (!redis) return null;
  return (await redis.get<StoredPaycrestOrder>(orderKey(id))) ?? null;
}

/**
 * Lists a wallet's stored orders, newest first. Backed by the per-wallet index;
 * skips any index entries whose record has since expired.
 */
export async function listStoredOrdersByWallet(
  address: string
): Promise<StoredPaycrestOrder[]> {
  if (!redis) return [];
  const ids = await redis.zrange<string[]>(walletIndexKey(address), 0, -1, {
    rev: true,
  });
  if (!ids.length) return [];
  const records = await Promise.all(ids.map((id) => getStoredOrder(id)));
  return records.filter((r): r is StoredPaycrestOrder => r !== null);
}

/** Statuses we'd consider "still moving" — exported for reconcile callers. */
export function isStoredOrderTerminal(record: StoredPaycrestOrder): boolean {
  return isPaycrestTerminalStatus(record.order.status as PaycrestOrderStatus);
}
