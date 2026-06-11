import { NextRequest, NextResponse } from "next/server";
import { PAYCREST_BASE_URL, isPaycrestConfigured } from "@/rails/paycrest";

/**
 * GET /api/paycrest/orders?address=0x...
 *
 * Lists the connected wallet's Paycrest orders so History can show live
 * status. Proxies Paycrest's sender orders list (server-only API key) and
 * filters to the orders that belong to this wallet (its refund / return /
 * recipient address), normalising each to a compact display shape.
 */

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

interface OrderSummary {
  id: string;
  direction: "offramp" | "onramp";
  status: string;
  amount: string;
  token: string;
  network: string;
  rate: string | null;
  /** Fiat currency for the leg, when known. */
  currency: string | null;
  /** Fiat amount the recipient gets (off-ramp), computed from rate. */
  fiatAmount: number | null;
  recipientName: string | null;
  institution: string | null;
  accountIdentifier: string | null;
  /** Off-ramp deposit address — present means the order can still be funded. */
  receiveAddress: string | null;
  txHash: string | null;
  createdAt: string | null;
}

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
      `${PAYCREST_BASE_URL}/v1/sender/orders?page=1&pageSize=100`,
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
    data && typeof data === "object" && Array.isArray((data as Record<string, unknown>).orders)
      ? ((data as Record<string, unknown>).orders as Record<string, unknown>[])
      : [];

  const want = address.toLowerCase();
  const orders: OrderSummary[] = list
    .filter((o) => {
      const recipient = (o.recipient as Record<string, unknown>) ?? {};
      const candidates = [
        o.refundAddress,
        o.returnAddress,
        o.fromAddress,
        recipient.address,
      ];
      return candidates.some(
        (c) => typeof c === "string" && c.toLowerCase() === want
      );
    })
    .map((o) => {
      const recipient = (o.recipient as Record<string, unknown>) ?? {};
      const institution =
        typeof recipient.institution === "string" ? recipient.institution : null;
      const amount = typeof o.amount === "string" ? o.amount : String(o.amount ?? "");
      const rate = typeof o.rate === "string" ? o.rate : null;
      const currency =
        typeof recipient.currency === "string" ? recipient.currency : null;
      const fiatAmount =
        rate && amount ? Number(amount) * Number(rate) : null;
      return {
        id: String(o.id ?? ""),
        // Bank/mobile-money recipient → off-ramp; otherwise treat as on-ramp.
        direction: institution ? "offramp" : "onramp",
        status: typeof o.status === "string" ? o.status : "unknown",
        amount,
        token: typeof o.token === "string" ? o.token : "USDC",
        network: typeof o.network === "string" ? o.network : "",
        rate,
        currency,
        fiatAmount: Number.isFinite(fiatAmount as number) ? fiatAmount : null,
        recipientName:
          typeof recipient.accountName === "string"
            ? recipient.accountName
            : null,
        institution,
        accountIdentifier:
          typeof recipient.accountIdentifier === "string"
            ? recipient.accountIdentifier
            : null,
        receiveAddress:
          typeof o.receiveAddress === "string" && o.receiveAddress
            ? o.receiveAddress
            : null,
        txHash: typeof o.txHash === "string" && o.txHash ? o.txHash : null,
        createdAt: typeof o.createdAt === "string" ? o.createdAt : null,
      };
    });

  return NextResponse.json({ orders });
}
