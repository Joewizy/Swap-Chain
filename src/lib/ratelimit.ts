/**
 * API rate limiting (Upstash Redis, sliding window).
 *
 */
import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "./redis";

/** Coarse buckets — see middleware for how routes map onto them. */
export type RateTier = "default" | "llm" | "verify" | "order" | "webhook";

type Window = `${number} ${"s" | "m" | "h"}`;

function make(limit: number, window: Window): Ratelimit | null {
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, window),
    prefix: "swapchain/rl",
    analytics: false,
  });
}

// Tighter on the routes that cost money (LLM) or resolve real-person PII
// (verify-account). `order` is generous because settlement polling is chatty.
const limiters: Record<RateTier, Ratelimit | null> = {
  default: make(60, "1 m"),
  llm: make(10, "1 m"),
  verify: make(8, "1 m"),
  order: make(120, "1 m"),
  // Inbound Paycrest webhooks share a handful of source IPs and can burst when
  // many orders settle at once; the HMAC signature is the real gate, so this
  // tier just caps abuse rather than throttling legitimate deliveries.
  webhook: make(300, "1 m"),
};

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  /** Epoch ms when the window resets. */
  reset: number;
}

export async function rateLimit(
  tier: RateTier,
  key: string
): Promise<RateLimitResult> {
  const limiter = limiters[tier];
  if (!limiter) {
    return { success: true, limit: -1, remaining: -1, reset: 0 };
  }
  const { success, limit, remaining, reset } = await limiter.limit(key);
  return { success, limit, remaining, reset };
}

export function isRateLimitConfigured(): boolean {
  return redis !== null;
}
