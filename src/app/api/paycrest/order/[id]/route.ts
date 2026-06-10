import { NextRequest, NextResponse } from "next/server";
import {
  PAYCREST_BASE_URL,
  isPaycrestConfigured,
  normalizePaycrestOrder,
  type PaycrestOrder,
} from "@/rails/paycrest";

/**
 * GET /api/paycrest/order/:id
 *
 * Reads back an off-ramp or on-ramp order so the UI can poll to settlement.
 * Proxies Paycrest's v2 Sender API GET /v2/sender/orders/:id.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Order id is required" }, { status: 400 });
  }

  const apiKey = process.env.PAYCREST_API_KEY;
  if (!isPaycrestConfigured() || !apiKey) {
    return NextResponse.json(
      {
        error:
          "Paycrest is not configured. Set PAYCREST_API_KEY in the server env.",
      },
      { status: 501 }
    );
  }

  let res: Response;
  try {
    res = await fetch(`${PAYCREST_BASE_URL}/v2/sender/orders/${id}`, {
      headers: { "API-Key": apiKey, Accept: "application/json" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Paycrest request failed",
      },
      { status: 502 }
    );
  }

  const raw: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    return NextResponse.json(
      { error: `Paycrest order lookup failed (${res.status}).` },
      { status: res.status === 401 ? 401 : res.status === 404 ? 404 : 502 }
    );
  }

  const payload =
    raw && typeof raw === "object" && "data" in raw
      ? ((raw as Record<string, unknown>).data as Record<string, unknown>)
      : (raw as Record<string, unknown> | null);

  if (!payload || typeof payload.id !== "string") {
    return NextResponse.json(
      { error: "Paycrest returned an unrecognised response", raw },
      { status: 502 }
    );
  }

  const order: PaycrestOrder = normalizePaycrestOrder(payload, raw);
  return NextResponse.json(order);
}
