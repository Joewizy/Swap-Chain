import { NextRequest, NextResponse } from "next/server";
import { PAYCREST_BASE_URL, isPaycrestFiat } from "@/rails/paycrest";

/**
 * GET /api/paycrest/rate?fiat=NGN&token=USDC
 *
 * Returns the current unit rate (fiat per 1 token) so the UI can estimate
 * the USDC a user receives for a fiat on-ramp before creating an order.
 * Proxies Paycrest's public /v1/rates/:token/1/:fiat (no key). Large
 * amounts can 503 (no provider), so we always price the unit rate.
 */
export async function GET(req: NextRequest) {
  const fiat = req.nextUrl.searchParams.get("fiat");
  const token = (req.nextUrl.searchParams.get("token") || "USDC").toLowerCase();

  if (!fiat || !isPaycrestFiat(fiat)) {
    return NextResponse.json(
      { error: `Unsupported currency "${String(fiat)}"` },
      { status: 400 }
    );
  }

  let res: Response;
  try {
    res = await fetch(
      `${PAYCREST_BASE_URL}/v1/rates/${token}/1/${fiat.toLowerCase()}`,
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
  const data =
    raw && typeof raw === "object"
      ? (raw as Record<string, unknown>).data
      : null;
  const rate = typeof data === "string" ? Number(data) : Number(data);

  if (!res.ok || !Number.isFinite(rate) || rate <= 0) {
    const message =
      raw && typeof raw === "object"
        ? String((raw as Record<string, unknown>).message ?? "")
        : "";
    return NextResponse.json(
      { error: message || "Couldn't fetch a rate." },
      { status: 502 }
    );
  }

  return NextResponse.json({ rate, fiat: fiat.toUpperCase(), token: token.toUpperCase() });
}
