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
  /** Last webhook event type that touched this record, e.g. "ramp.order.completed". */
  event: string | null;
  updatedAt: string;
  terminalAt?: string;
}

const ORDER_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const EVENT_TTL_SECONDS = 60 * 60 * 24 * 7; // covers the retry window

const orderKey = (id: string) => `chainrails:store:order:${id}`;
const eventKey = (eventId: string) => `chainrails:store:event:${eventId}`;

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
}

/** Idempotent, monotonic upsert of a ramp-order snapshot from the webhook. */
export async function upsertStoredRampOrder(
  input: Omit<StoredRampOrder, "phase" | "updatedAt" | "terminalAt"> & {
    updatedAt?: string;
  }
): Promise<RampUpsertResult> {
  if (!redis) return { stored: null, changed: false };

  const phase = classifyRampStatus(input.status);
  const nowIso = new Date().toISOString();
  const next: StoredRampOrder = {
    ...input,
    phase,
    updatedAt: input.updatedAt ?? nowIso,
  };

  try {
    const existing = await redis.get<StoredRampOrder>(orderKey(input.id));
    if (existing && !shouldReplace(existing, next)) {
      return { stored: existing, changed: false };
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
      terminalAt: becameTerminal
        ? (existing?.terminalAt ?? nowIso)
        : existing?.terminalAt,
    };

    await redis.set(orderKey(input.id), record, { ex: ORDER_TTL_SECONDS });
    return { stored: record, changed: true };
  } catch (err) {
    // Best-effort: a store outage must not break the webhook ack.
    console.error("[chainrailsStore] upsert failed", err);
    return { stored: null, changed: false };
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
