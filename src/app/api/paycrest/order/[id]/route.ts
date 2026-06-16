import { NextRequest, NextResponse } from "next/server";
import {
  PAYCREST_BASE_URL,
  isPaycrestConfigured,
  isPaycrestTerminalStatus,
  normalizePaycrestOrder,
  walletFromPaycrestPayload,
  type PaycrestOrder,
} from "@/rails/paycrest";
import { getStoredOrder, upsertStoredOrder } from "@/lib/orderStore";

/**
 * GET /api/paycrest/order/:id
 *
 * Reads back an off-ramp or on-ramp order so the UI can poll to settlement.
 * Store-first: a webhook may have already recorded a terminal state, in which
 * case we serve that without calling Paycrest (saves an API call and survives
 * Paycrest being briefly down). Otherwise we proxy Paycrest's v2 Sender API
 * GET /v2/sender/orders/:id and refresh the store with what we got.
 */
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

  // Fast path: a webhook already saw this order reach a final state. Nothing
  // further can change, so skip the upstream call and serve the stored snapshot.
  const stored = await getStoredOrder(id);
  if (stored && isPaycrestTerminalStatus(stored.order.status)) {
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
  // Keep our store warm from live reads too — this is the backstop for orders
  // whose webhook was missed, and it lets the fast path above kick in next time.
  void upsertStoredOrder(order, {
    walletAddress: walletFromPaycrestPayload(payload),
    event: "live_read",
  });
  return NextResponse.json(order);
}
