import { NextRequest, NextResponse } from "next/server";
import {
  PAYCREST_BASE_URL,
  isPaycrestFiat,
  type PaycrestInstitution,
} from "@/rails/paycrest";

/**
 * GET /api/paycrest/institutions?currency=NGN
 *
 * Lists the banks / mobile-money providers Paycrest can pay out to for a
 * currency, for the off-ramp recipient dropdown. Proxies Paycrest's public
 * /v1/institutions/:currency (no key needed) — kept server-side for one
 * consistent shape and to dodge browser CORS.
 */
export async function GET(req: NextRequest) {
  const currency = req.nextUrl.searchParams.get("currency");

  if (!currency || !isPaycrestFiat(currency)) {
    return NextResponse.json(
      { error: `Unsupported payout currency "${String(currency)}"` },
      { status: 400 }
    );
  }

  let res: Response;
  try {
    res = await fetch(
      `${PAYCREST_BASE_URL}/v1/institutions/${currency.toUpperCase()}`,
      { headers: { Accept: "application/json" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Upstream request failed",
      },
      { status: 502 }
    );
  }

  const raw: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    return NextResponse.json(
      { error: `Couldn't load banks (${res.status}).` },
      { status: 502 }
    );
  }

  const data =
    raw && typeof raw === "object" && "data" in raw
      ? (raw as { data: unknown }).data
      : raw;

  const institutions: PaycrestInstitution[] = Array.isArray(data)
    ? (data as PaycrestInstitution[])
    : [];

  return NextResponse.json({ institutions });
}
