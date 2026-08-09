import { NextRequest, NextResponse } from "next/server";
import { CHAINRAILS_OFFRAMP_ENABLED } from "@/rails/chainrails";

const API_URL = "https://api.chainrails.io/api/v1/ramp/orders";

/**
 * Creates a Chainrails ramp order. We proxy the REST call rather than exposing
 * the provider API key to the browser.
 *
 * Handles both directions:
 *  - on-ramp  (fiat → crypto): needs destinationChain + recipientAddress.
 *  - off-ramp (crypto → fiat): needs sourceChain + senderAddress.
 *
 * `fields` stays open-ended because FONBNK's direct flow requires channel-
 * specific values (phoneNumber, bankCode, bankAccountNumber, userEmail) whose
 * exact set the quote's `fieldsRequired` describes.
 */
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

  const type = body.type === "off-ramp" ? "off-ramp" : "on-ramp";
  const isOfframp = type === "off-ramp";

  if (isOfframp && !CHAINRAILS_OFFRAMP_ENABLED) {
    return NextResponse.json(
      { error: "Selling from this network is temporarily unavailable." },
      { status: 503 }
    );
  }

  const required = isOfframp
    ? [
        "provider",
        "fiatCurrency",
        "cryptoAmount",
        "sourceChain",
        "senderAddress",
        "countryCode",
      ]
    : [
        "provider",
        "fiatCurrency",
        "cryptoAmount",
        "destinationChain",
        "recipientAddress",
        "countryCode",
      ];
  const missing = required.filter((field) => !body[field]);
  if (missing.length) {
    return NextResponse.json(
      { error: `Missing required field(s): ${missing.join(", ")}` },
      { status: 400 }
    );
  }

  const cryptoAmount = Number(body.cryptoAmount);
  if (!Number.isFinite(cryptoAmount) || cryptoAmount <= 0) {
    return NextResponse.json(
      { error: "cryptoAmount must be a positive number." },
      { status: 400 }
    );
  }

  const payload: Record<string, unknown> = {
    type,
    provider: body.provider,
    fiatCurrency: String(body.fiatCurrency).toUpperCase(),
    cryptoAmount,
    countryCode: String(body.countryCode).toUpperCase(),
    ...(isOfframp
      ? { sourceChain: body.sourceChain, senderAddress: body.senderAddress }
      : {
          destinationChain: body.destinationChain,
          recipientAddress: body.recipientAddress,
        }),
    // NOTE: the live orders endpoint rejects both `paymentChannelId` and
    // `quoteId` ("property … should not exist") even though the SDK types list
    // them — so we never forward them.
    // `userEmail` must be TOP-LEVEL: the provider 403s ("userEmail is required
    // for KYC verification") when it's nested inside `fields`.
    ...(typeof body.userEmail === "string"
      ? { userEmail: body.userEmail }
      : {}),
    ...(body.fields && typeof body.fields === "object"
      ? { fields: body.fields }
      : {}),
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
      // Surface the real upstream failure to the server logs before we map it
      // to a user-facing message (KYC/email gating shows up here).
      console.error(
        `[chainrails ramp order] ${type} upstream ${upstream.status}:`,
        JSON.stringify(data)
      );
      // On failure, also dump the exact payload we sent so we can diff it
      // against a known-good request (e.g. a working curl). The upstream 500 is
      // generic — the difference is almost always here, in `fields`.
      console.error(
        `[chainrails ramp order] ${type} request payload:`,
        JSON.stringify(payload)
      );
      // Upstream 5xx means Chainrails/the payout provider crashed on their end
      // (not a validation problem we can guide the user through). Don't leak the
      // raw provider message — show a neutral retry prompt instead.
      const message =
        upstream.status >= 500
          ? isOfframp
            ? "Selling isn't available right now — please try again shortly."
            : "This isn't available right now — please try again shortly."
          : data && typeof data === "object" && "message" in data
            ? String((data as Record<string, unknown>).message)
            : data && typeof data === "object" && "error" in data
              ? String((data as Record<string, unknown>).error)
              : `Chainrails order failed (${upstream.status}).`;
      return NextResponse.json({ error: message }, { status: upstream.status });
    }
    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Couldn't reach Chainrails to create the order." },
      { status: 502 }
    );
  }
}

/**
 * DEV-ONLY order list. Chainrails' list endpoint is scoped to our API key
 * (account-wide, every user), so this is a debugging aid to map an intent
 * address from the provider dashboard back to a numeric order id and inspect
 * terminal statuses. It never runs in production. Query string is passed
 * through, e.g. `?status=completed&limit=100`.
 */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  }
  const apiKey = process.env.CHAINRAILS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "CHAINRAILS_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }
  try {
    const upstream = await fetch(`${API_URL}${req.nextUrl.search}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    const data: unknown = await upstream.json().catch(() => null);
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json(
      { error: "Couldn't reach Chainrails to list orders." },
      { status: 502 }
    );
  }
}
