/**
 * Shared Upstash Redis client.
 *
 * Returns null when Upstash isn't configured (local dev), so callers must
 * degrade gracefully rather than assume a store exists. Used by both the rate
 * limiter and payout idempotency.
 */
import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

export const redis = url && token ? new Redis({ url, token }) : null;
