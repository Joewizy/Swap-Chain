import { NextRequest, NextResponse } from "next/server";
import {
  PAYCREST_BASE_URL,
  isPaycrestConfigured,
  normalizePaycrestOrder,
  walletFromPaycrestPayload,
  type PaycrestOrder,
} from "@/rails/paycrest";
import { getStoredOrder, upsertStoredOrder } from "@/lib/orderStore";


export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // Validate the id shape before interpolating it into the upstream URL so a
  // crafted value (e.g. encoded "../") can't redirect our API-Key'd request to
  // another Paycrest endpoint (path traversal / constrained SSRF).
  if (!id || !/^[a-zA-Z0-9-]{8,64}$/.test(id)) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }

  // Store-first: the webhook + cron keep this fresh, so a poll is a Redis read,
  // not a Paycrest round-trip. Cold/missing store falls through to live below.
  const stored = await getStoredOrder(id);
  if (stored) {
    return NextResponse.json(stored.order);
  }

  const apiKey = process.env.PAYCREST_API_KEY;
  if (!isPaycrestConfigured() || !apiKey) {
    return NextResponse.json(
      {
        error:
          "Fiat payouts aren't available right now.",
      },
      { status: 501 }
    );
  }

  let res: Response;
  try {
    res = await fetch(
      `${PAYCREST_BASE_URL}/v2/sender/orders/${encodeURIComponent(id)}`,
      {
        headers: { "API-Key": apiKey, Accept: "application/json" },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Request failed",
      },
      { status: 502 }
    );
  }

  const raw: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    return NextResponse.json(
      { error: `Couldn't load this order (${res.status}).` },
      { status: res.status === 401 ? 401 : res.status === 404 ? 404 : 502 }
    );
  }

  const payload =
    raw && typeof raw === "object" && "data" in raw
      ? ((raw as Record<string, unknown>).data as Record<string, unknown>)
      : (raw as Record<string, unknown> | null);

  if (!payload || typeof payload.id !== "string") {
    console.error("[paycrest] unexpected order-detail shape", raw);
    return NextResponse.json(
      { error: "Unexpected response from payout service" },
      { status: 502 }
    );
  }

  const order: PaycrestOrder = normalizePaycrestOrder(payload, raw);
  // Warm the store so the next poll hits the fast path.
  void upsertStoredOrder(order, {
    walletAddress: walletFromPaycrestPayload(payload),
    event: "live_read",
  });
  return NextResponse.json(order);
}
