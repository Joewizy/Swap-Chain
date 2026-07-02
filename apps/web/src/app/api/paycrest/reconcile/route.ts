import { NextRequest, NextResponse } from "next/server";
import {
  PAYCREST_BASE_URL,
  isPaycrestTerminalStatus,
  normalizePaycrestOrder,
  walletFromPaycrestPayload,
} from "@/rails/paycrest";
import { listOpenOrderIds, upsertStoredOrder } from "@/lib/orderStore";

/**
 * Backstop for missed/delayed webhooks: re-syncs open orders from Paycrest into
 * the store (monotonically). Terminal orders leave the set, so work stays bounded.
 */

export const runtime = "nodejs";
export const maxDuration = 60; // Pro honours this; Hobby caps at its own limit

// Cap per run so a backlog can't time out; overflow waits for the next run.
// Fetches run in parallel — a run is ~one Paycrest round-trip, not N.
const MAX_PER_RUN = 50;

/** Re-syncs one open order from Paycrest into the store. */
async function reconcileOne(
  id: string,
  apiKey: string
): Promise<{ changed: boolean; terminal: boolean } | null> {
  let res: Response;
  try {
    res = await fetch(
      `${PAYCREST_BASE_URL}/v2/sender/orders/${encodeURIComponent(id)}`,
      { headers: { "API-Key": apiKey, Accept: "application/json" } }
    );
  } catch {
    return null; // transient — try again next run
  }
  if (!res.ok) return null;

  const raw: unknown = await res.json().catch(() => null);
  const payload =
    raw && typeof raw === "object" && "data" in raw
      ? ((raw as Record<string, unknown>).data as Record<string, unknown>)
      : (raw as Record<string, unknown> | null);
  if (!payload || typeof payload.id !== "string") return null;

  const order = normalizePaycrestOrder(payload, raw);
  const { changed } = await upsertStoredOrder(order, {
    walletAddress: walletFromPaycrestPayload(payload),
    event: "reconcile",
  });
  return { changed, terminal: isPaycrestTerminalStatus(order.status) };
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.PAYCREST_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Paycrest not configured" },
      { status: 501 }
    );
  }

  const open = await listOpenOrderIds();
  const ids = open.slice(0, MAX_PER_RUN);
  const results = await Promise.all(ids.map((id) => reconcileOne(id, apiKey)));

  const checked = results.filter((r) => r !== null).length;
  const advanced = results.filter((r) => r?.changed).length;
  const nowTerminal = results.filter((r) => r?.terminal).length;

  return NextResponse.json({
    open: open.length,
    checked,
    advanced,
    nowTerminal,
  });
}
