import { NextRequest, NextResponse } from "next/server";
import { PAYCREST_BASE_URL } from "@/rails/paycrest";

/**
 * POST /api/paycrest/verify-account
 *
 * Resolves the real account holder's name for an { institution,
 * accountIdentifier } pair, so the off-ramp / refund form can confirm the
 * recipient instead of asking the user to type a name. Proxies Paycrest's
 * public /v1/verify-account (no key needed) for one consistent shape.
 *
 * Body: { institution, accountIdentifier }  →  { accountName }
 */
export async function POST(req: NextRequest) {
  let body: { institution?: unknown; accountIdentifier?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { institution, accountIdentifier } = body;
  if (
    typeof institution !== "string" ||
    !institution ||
    typeof accountIdentifier !== "string" ||
    !accountIdentifier
  ) {
    return NextResponse.json(
      { error: "institution and accountIdentifier are required" },
      { status: 400 }
    );
  }

  let res: Response;
  try {
    res = await fetch(`${PAYCREST_BASE_URL}/v1/verify-account`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ institution, accountIdentifier }),
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
    const message =
      raw && typeof raw === "object"
        ? String((raw as Record<string, unknown>).message ?? "")
        : "";
    return NextResponse.json(
      { error: message || "Couldn't verify this account." },
      { status: res.status === 404 ? 404 : 422 }
    );
  }

  // Paycrest returns the resolved name as `data` (a string).
  const accountName =
    raw && typeof raw === "object" && typeof (raw as { data?: unknown }).data === "string"
      ? ((raw as { data: string }).data as string)
      : "";

  if (!accountName) {
    return NextResponse.json(
      { error: "No account found for those details." },
      { status: 422 }
    );
  }

  return NextResponse.json({ accountName });
}
