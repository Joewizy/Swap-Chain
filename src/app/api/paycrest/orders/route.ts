import { NextRequest, NextResponse } from "next/server";
import {
  PAYCREST_BASE_URL,
  isPaycrestConfigured,
  orderMatchesWallet,
  summarizePaycrestOrderForHistory,
  type PaycrestHistoryOrder,
} from "@/rails/paycrest";

/**
 * GET /api/paycrest/orders?address=0x...
 *
 * Lists the connected wallet's Paycrest orders so History can show live
 * status. Proxies Paycrest's v2 sender orders list (server-only API key) and
 * filters to orders tied to this wallet (refund address on off-ramp, crypto
 * recipient on on-ramp).
 */

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address || !EVM_ADDRESS.test(address)) {
    return NextResponse.json(
      { error: "A valid ?address= is required" },
      { status: 400 }
    );
  }

  const apiKey = process.env.PAYCREST_API_KEY;
  if (!isPaycrestConfigured() || !apiKey) {
    return NextResponse.json(
      { error: "Paycrest is not configured." },
      { status: 501 }
    );
  }

  let res: Response;
  try {
    res = await fetch(
      `${PAYCREST_BASE_URL}/v2/sender/orders?page=1&pageSize=100`,
      { headers: { "API-Key": apiKey, Accept: "application/json" } }
    );
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
      { error: `Paycrest orders list failed (${res.status}).` },
      { status: 502 }
    );
  }

  const data =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>).data : null;
  const list =
    data &&
    typeof data === "object" &&
    Array.isArray((data as Record<string, unknown>).orders)
      ? ((data as Record<string, unknown>).orders as Record<string, unknown>[])
      : [];

  const orders: PaycrestHistoryOrder[] = list
    .filter((o) => orderMatchesWallet(o, address))
    .map((o) => summarizePaycrestOrderForHistory(o))
    .sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });

  return NextResponse.json({ orders });
}
