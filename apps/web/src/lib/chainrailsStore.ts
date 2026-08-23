/**
 * Server-owned ChainRails ramp-order store (Upstash Redis) — the twin of
 * orderStore for the ChainRails rail.
 *
 * The webhook writes order state here so we know an order settled even after
 * the user closed the tab (polling only runs while the tab is open). Keyed by
 * the numeric ramp order id.
 *
 * No-ops when Redis is unconfigured (local dev without Upstash), so callers
 * must degrade to a live provider read rather than assume a store exists.
 */
import { createHash } from "node:crypto";
import { redis } from "@/lib/redis";
import {
  classifyRampStatus,
  isRampPhaseTerminal,
  type RampOrderPhase,
} from "@/rails/chainrails";

/** PII-light snapshot of a ramp order, as the webhook sees it. */
export interface StoredRampOrder {
  id: string;
  /** Raw provider status, e.g. "PAYMENT_RECEIVED" / "COMPLETED". */
  status: string;
  phase: RampOrderPhase;
  direction: "onramp" | "offramp" | null;
  intentAddress: string | null;
  fiatCurrency: string | null;
  fiatAmount: number | null;
  cryptoCurrency: string | null;
  cryptoAmount: number | null;
  /** When the order was created (ISO), when known — drives history sort. */
  createdAt: string | null;
  /** Last webhook event type that touched this record, e.g. "ramp.order.completed". */
  event: string | null;
  updatedAt: string;
  terminalAt?: string;
}

const ORDER_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const EVENT_TTL_SECONDS = 60 * 60 * 24 * 7; // covers the retry window

const orderKey = (id: string) => `chainrails:store:order:${id}`;
const eventKey = (eventId: string) => `chainrails:store:event:${eventId}`;
/** Owner index: a person's order ids, keyed by a hash of their email (raw
 *  email never becomes a key). Soft identity until email verification lands. */
const emailIndexKey = (email: string) =>
  `chainrails:store:email:${hashEmail(email)}`;

function hashEmail(email: string): string {
  return createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex")
    .slice(0, 32);
}

/** pending < processing < terminal; unknown never wins. */
function phaseRank(phase: RampOrderPhase): number {
  switch (phase) {
    case "pending":
      return 1;
    case "processing":
      return 2;
    case "completed":
    case "expired":
    case "failed":
      return 3;
    default:
      return 0;
  }
}

function timeOf(iso: string | undefined | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/** Claims an event id so a retried/duplicate webhook is processed once. */
export async function markRampEventSeen(eventId: string): Promise<boolean> {
  if (!redis) return true;
  try {
    const claim = await redis.set(eventKey(eventId), 1, {
      nx: true,
      ex: EVENT_TTL_SECONDS,
    });
    return claim !== null;
  } catch (err) {
    // Can't dedupe with Redis down — process anyway; the upsert is monotonic.
    console.error("[chainrailsStore] event-dedupe failed", err);
    return true;
  }
}

/**
 * Releases an event-id claim so a later retry isn't dropped as a duplicate.
 * Called when persisting the order failed after the claim was taken.
 */
export async function releaseRampEvent(eventId: string): Promise<void> {
  if (!redis) return;
  try {
    await redis.del(eventKey(eventId));
  } catch (err) {
    console.error("[chainrailsStore] event-release failed", err);
  }
}

/** Never move an order backwards or leave a terminal state; ties prefer newer. */
function shouldReplace(prev: StoredRampOrder, next: StoredRampOrder): boolean {
  if (isRampPhaseTerminal(prev.phase) && !isRampPhaseTerminal(next.phase)) {
    return false;
  }
  const pr = phaseRank(prev.phase);
  const nr = phaseRank(next.phase);
  if (nr !== pr) return nr > pr;
  return timeOf(next.updatedAt) >= timeOf(prev.updatedAt);
}

export interface RampUpsertResult {
  stored: StoredRampOrder | null;
  changed: boolean;
  /** True when a configured store errored — the caller must not ack the event. */
  failed: boolean;
}

/** Idempotent, monotonic upsert of a ramp-order snapshot from the webhook. */
export async function upsertStoredRampOrder(
  input: Omit<
    StoredRampOrder,
    "phase" | "updatedAt" | "terminalAt" | "createdAt"
  > & {
    updatedAt?: string;
    createdAt?: string | null;
  }
): Promise<RampUpsertResult> {
  // Unconfigured store is a deliberate no-op (callers read live); not a failure.
  if (!redis) return { stored: null, changed: false, failed: false };

  const phase = classifyRampStatus(input.status);
  const nowIso = new Date().toISOString();
  const next: StoredRampOrder = {
    ...input,
    phase,
    createdAt: input.createdAt ?? null,
    updatedAt: input.updatedAt ?? nowIso,
  };

  try {
    const existing = await redis.get<StoredRampOrder>(orderKey(input.id));
    if (existing && !shouldReplace(existing, next)) {
      return { stored: existing, changed: false, failed: false };
    }

    const becameTerminal = isRampPhaseTerminal(phase);
    const record: StoredRampOrder = {
      ...next,
      // Don't drop fields a sparse later event omits.
      direction: next.direction ?? existing?.direction ?? null,
      intentAddress: next.intentAddress ?? existing?.intentAddress ?? null,
      fiatCurrency: next.fiatCurrency ?? existing?.fiatCurrency ?? null,
      fiatAmount: next.fiatAmount ?? existing?.fiatAmount ?? null,
      cryptoCurrency: next.cryptoCurrency ?? existing?.cryptoCurrency ?? null,
      cryptoAmount: next.cryptoAmount ?? existing?.cryptoAmount ?? null,
      createdAt: next.createdAt ?? existing?.createdAt ?? null,
      terminalAt: becameTerminal
        ? (existing?.terminalAt ?? nowIso)
        : existing?.terminalAt,
    };

    await redis.set(orderKey(input.id), record, { ex: ORDER_TTL_SECONDS });
    return { stored: record, changed: true, failed: false };
  } catch (err) {
    // Store outage: signal the caller so the webhook can 5xx and be retried
    // instead of acking an event we never persisted.
    console.error("[chainrailsStore] upsert failed", err);
    return { stored: null, changed: false, failed: true };
  }
}

/** Attach an order to a person's email index (soft owner key). */
export async function indexRampOrderForEmail(
  email: string,
  orderId: string,
  createdAt: number
): Promise<void> {
  if (!redis || !email) return;
  try {
    const key = emailIndexKey(email);
    await redis.zadd(key, { score: createdAt || Date.now(), member: orderId });
    await redis.expire(key, ORDER_TTL_SECONDS);
  } catch (err) {
    console.error("[chainrailsStore] email index failed", err);
  }
}

/** A stored ramp order, or null when absent / unconfigured (caller reads live). */
export async function getStoredRampOrder(
  id: string
): Promise<StoredRampOrder | null> {
  if (!redis) return null;
  try {
    return (await redis.get<StoredRampOrder>(orderKey(id))) ?? null;
  } catch (err) {
    console.error("[chainrailsStore] get failed", err);
    return null;
  }
}

/** A person's stored orders, newest first; skips entries whose record expired. */
export async function listStoredRampOrdersByEmail(
  email: string
): Promise<StoredRampOrder[]> {
  if (!redis || !email) return [];
  try {
    const ids = await redis.zrange<string[]>(emailIndexKey(email), 0, -1, {
      rev: true,
    });
    if (!ids.length) return [];
    const records = await Promise.all(ids.map((id) => getStoredRampOrder(id)));
    return records.filter((r): r is StoredRampOrder => r !== null);
  } catch (err) {
    console.error("[chainrailsStore] listByEmail failed", err);
    return [];
  }
}
