import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  markRampEventSeen,
  upsertStoredRampOrder,
} from "@/lib/chainrailsStore";

export const runtime = "nodejs"; 
const MAX_SKEW_MS = 5 * 60 * 1000;

function expectedSignature(
  rawBody: string,
  timestamp: string,
  secret: string
): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex")
    .toLowerCase();
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  } catch {
    return false;
  }
}

/** Best-effort replay guard: block only when we can confidently read an old
 *  timestamp — a format we can't parse still passes (the HMAC already gates). */
function timestampFresh(timestamp: string): boolean {
  const n = Number(timestamp);
  if (!Number.isFinite(n)) return true;
  const ms = n > 1e12 ? n : n * 1000; // seconds → ms
  return Math.abs(Date.now() - ms) <= MAX_SKEW_MS;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

export async function POST(req: NextRequest) {
  const secret = process.env.CHAINRAILS_WEBHOOK_SECRET;
  if (!secret) {
    // Can't authenticate the event — refuse. 503 so ChainRails retries once set.
    console.error("[chainrails webhook] CHAINRAILS_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const rawBody = await req.text();
  const timestamp = req.headers.get("x-chainrails-timestamp");
  const signature = (req.headers.get("x-chainrails-signature") ?? "")
    .trim()
    .toLowerCase();
  if (!timestamp || !signature) {
    return NextResponse.json(
      { error: "Missing signature headers" },
      { status: 401 }
    );
  }
  if (!timingSafeEqualHex(expectedSignature(rawBody, timestamp, secret), signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  if (!timestampFresh(timestamp)) {
    return NextResponse.json({ error: "Stale timestamp" }, { status: 401 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const type = asString(event.type) ?? "";
  const data =
    event.data && typeof event.data === "object"
      ? (event.data as Record<string, unknown>)
      : null;

  // We only persist ramp-order events (our flows are ramp orders); ack the rest
  // so ChainRails stops retrying them.
  if (!data || !type.startsWith("ramp.order")) {
    return NextResponse.json({ received: true, ignored: true });
  }

  const id = data.ramp_order_id != null ? String(data.ramp_order_id) : null;
  const status = asString(data.ramp_status);
  if (!id || !status) {
    console.error("[chainrails webhook] unusable ramp payload", type);
    return NextResponse.json({ received: true, ignored: true });
  }

  // Dedupe on the event id (ChainRails retries), else on an (id, status) key.
  const dedupeKey = asString(event.id) ?? `${id}:${status}`;
  if (!(await markRampEventSeen(dedupeKey))) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const { changed, stored } = await upsertStoredRampOrder({
    id,
    status,
    direction: null, // ramp payload doesn't carry direction; left for the app
    intentAddress: asString(data.intent_address),
    fiatCurrency: asString(data.fiat_currency),
    fiatAmount: asNumber(data.fiat_amount),
    cryptoCurrency: asString(data.crypto_currency),
    cryptoAmount: asNumber(data.crypto_amount),
    event: type,
  });

  if (changed) {
    console.log(
      `[chainrails webhook] ${type} order ${id} → ${stored?.phase} (${status})`
    );
  }
  return NextResponse.json({ received: true, changed });
}
