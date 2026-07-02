import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  normalizePaycrestOrder,
  walletFromPaycrestPayload,
  type PaycrestOrder,
} from "@/rails/paycrest";
import { markWebhookEventSeen, upsertStoredOrder } from "@/lib/orderStore";

export const runtime = "nodejs"; // node:crypto + raw body; must not run on edge

/** Mirrors Paycrest's published verification: trim+lowercase, timing-safe hex compare. */
function verifyPaycrestSignature(
  rawBody: string,
  signature: string | null,
  secret: string
): boolean {
  const sig = (signature ?? "").trim().toLowerCase();
  const key = secret.trim();
  if (!sig || !key) return false;
  const computed = createHmac("sha256", key)
    .update(rawBody, "utf8")
    .digest("hex")
    .toLowerCase();
  if (computed.length !== sig.length) return false;
  try {
    return timingSafeEqual(Buffer.from(computed, "utf8"), Buffer.from(sig, "utf8"));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.PAYCREST_WEBHOOK_SECRET;
  if (!secret) {
    // Can't authenticate the event — refuse. 503 so Paycrest retries once set.
    console.error("[paycrest webhook] PAYCREST_WEBHOOK_SECRET is not set");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 503 }
    );
  }

  const rawBody = await req.text();
  if (!verifyPaycrestSignature(rawBody, req.headers.get("x-paycrest-signature"), secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data = event.data;
  if (!data || typeof data !== "object" || typeof (data as Record<string, unknown>).id !== "string") {
    // Valid signature, unusable shape — ack so Paycrest stops retrying it.
    console.error("[paycrest webhook] unexpected event shape", event.event);
    return NextResponse.json({ received: true, ignored: true });
  }
  const payload = data as Record<string, unknown>;
  const eventName = typeof event.event === "string" ? event.event : null;

  // Dedupe on event id, else on an (id, status, updatedAt) fingerprint.
  const eventId =
    typeof event.eventId === "string" && event.eventId
      ? event.eventId
      : `${String(payload.id)}:${String(payload.status ?? "")}:${String(payload.updatedAt ?? "")}`;
  if (!(await markWebhookEventSeen(eventId))) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const order: PaycrestOrder = normalizePaycrestOrder(payload, payload);
  const walletAddress = walletFromPaycrestPayload(payload);
  const { changed } = await upsertStoredOrder(order, {
    walletAddress,
    event: eventName,
  });

  return NextResponse.json({ received: true, changed });
}
