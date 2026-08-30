import { NextRequest, NextResponse } from "next/server";

/**
 * Chainrails "headless KYC" proxy. Chainrails moved KYC from per-provider to
 * per-profile: the user submits the currently-missing fields ONCE (keyed by
 * their normalized email) and that profile is reused across every provider.
 *
 *   GET  /api/chainrails/ramp/kyc  — read the KYC state for a corridor. Returns
 *        `missingRequirements`, `canProceed`, `blocked`, etc. This is the same
 *        shape the order endpoint returns as `KYC_REQUIRED`, so we render the
 *        form straight from it instead of hardcoding fields.
 *   POST /api/chainrails/ramp/kyc  — submit collected field values. Submitting
 *        auto-creates the profile if needed and returns the updated state.
 *
 * Both proxy the provider REST call so the API key never reaches the browser
 * (the docs are explicit: "Never expose your Chainrails API key in a frontend
 * application"). Mirrors orders/route.ts for logging + PII redaction.
 */
const API_URL = "https://api.chainrails.io/api/v1/ramp/kyc";

/** The individual KYC field values are PII — mask them, keep the keys visible. */
function redactFields(fields: unknown): unknown {
  if (!fields || typeof fields !== "object") return fields;
  return { keys: Object.keys(fields as Record<string, unknown>) };
}

/** Read the current KYC state for a provider/corridor/amount. */
export async function GET(req: NextRequest) {
  const apiKey = process.env.CHAINRAILS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "CHAINRAILS_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  const params = req.nextUrl.searchParams;
  const required = ["provider", "userEmail", "countryCode", "fiatCurrency"];
  const missing = required.filter((k) => !params.get(k));
  if (missing.length) {
    return NextResponse.json(
      { error: `Missing required query param(s): ${missing.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const upstream = await fetch(`${API_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    const data: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      console.error(
        `[chainrails ramp kyc] state upstream ${upstream.status}:`,
        JSON.stringify(data)
      );
      const message =
        upstream.status >= 500
          ? "Verification is unavailable right now — please try again shortly."
          : data && typeof data === "object" && "message" in data
            ? String((data as Record<string, unknown>).message)
            : `Couldn't read verification status (${upstream.status}).`;
      return NextResponse.json({ error: message }, { status: upstream.status });
    }
    return NextResponse.json(data, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Couldn't reach Chainrails to check verification status." },
      { status: 502 }
    );
  }
}

/** Submit the currently-missing KYC fields for the user's profile. */
export async function POST(req: NextRequest) {
  const apiKey = process.env.CHAINRAILS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "CHAINRAILS_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const required = ["provider", "userEmail", "countryCode", "fiatCurrency"];
  const missing = required.filter((k) => !body[k]);
  if (missing.length) {
    return NextResponse.json(
      { error: `Missing required field(s): ${missing.join(", ")}` },
      { status: 400 }
    );
  }
  if (!body.fields || typeof body.fields !== "object") {
    return NextResponse.json(
      { error: "No verification details were provided." },
      { status: 400 }
    );
  }

  const payload: Record<string, unknown> = {
    provider: body.provider,
    userEmail: String(body.userEmail),
    countryCode: String(body.countryCode).toUpperCase(),
    fiatCurrency: String(body.fiatCurrency).toUpperCase(),
    ...(Number.isFinite(Number(body.cryptoAmount))
      ? { cryptoAmount: Number(body.cryptoAmount) }
      : {}),
    ...(typeof body.callbackUrl === "string"
      ? { callbackUrl: body.callbackUrl }
      : {}),
    fields: body.fields,
  };

  try {
    const upstream = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      console.error(
        `[chainrails ramp kyc] submit upstream ${upstream.status}:`,
        JSON.stringify(data)
      );
      // Dump the shape (not the values) of what we sent, so a structural
      // mismatch is diffable without leaking the user's KYC details or email.
      console.error(
        `[chainrails ramp kyc] submit payload:`,
        JSON.stringify({
          ...payload,
          userEmail: "[redacted]",
          fields: redactFields(payload.fields),
        })
      );
      const message =
        upstream.status >= 500
          ? "Verification is unavailable right now — please try again shortly."
          : data && typeof data === "object" && "message" in data
            ? String((data as Record<string, unknown>).message)
            : `Couldn't submit your verification details (${upstream.status}).`;
      return NextResponse.json({ error: message }, { status: upstream.status });
    }
    return NextResponse.json(data, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Couldn't reach Chainrails to submit verification." },
      { status: 502 }
    );
  }
}
