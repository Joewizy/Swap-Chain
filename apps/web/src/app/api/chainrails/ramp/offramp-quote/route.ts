import { NextRequest, NextResponse } from "next/server";
import { CHAINRAILS_OFFRAMP_ENABLED } from "@/rails/chainrails";

const API_URL = "https://api.chainrails.io/api/v1/ramp/quotes";

/**
 * Live Chainrails OFF-ramp quote (crypto → fiat). Unlike the SDK on-ramp quote,
 * this REST endpoint returns each provider's `paymentChannels[].
 * directTransferDetails.fieldsRequired` — including the dynamic `bankCode` enum
 * whose options ARE the bank list. The client renders those fields directly, so
 * there's no separate "banks" endpoint to call.
 *
 * We proxy from the server to keep the API key off the browser.
 */
export async function POST(req: NextRequest) {
  // Off-ramp is paused until Fiat KYB is approved (see CHAINRAILS_OFFRAMP_ENABLED).
  if (!CHAINRAILS_OFFRAMP_ENABLED) {
    return NextResponse.json(
      { error: "Selling from this network is temporarily unavailable." },
      { status: 503 }
    );
  }

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

  const cryptoAmount = Number(body.cryptoAmount);
  if (!Number.isFinite(cryptoAmount) || cryptoAmount <= 0) {
    return NextResponse.json(
      { error: "cryptoAmount must be a positive number." },
      { status: 400 }
    );
  }
  if (
    typeof body.fiatCurrency !== "string" ||
    typeof body.sourceChain !== "string" ||
    typeof body.countryCode !== "string"
  ) {
    return NextResponse.json(
      { error: "fiatCurrency, sourceChain, and countryCode are required." },
      { status: 400 }
    );
  }

  const params = new URLSearchParams({
    type: "off-ramp",
    fiatCurrency: body.fiatCurrency.toUpperCase(),
    cryptoAmount: String(cryptoAmount),
    sourceChain: body.sourceChain,
    countryCode: body.countryCode.toUpperCase(),
  });

  try {
    const upstream = await fetch(`${API_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    const data: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      console.error(
        `[chainrails] off-ramp quote failed (${upstream.status})`,
        JSON.stringify(data)
      );
      const message =
        data && typeof data === "object" && "message" in data
          ? String((data as Record<string, unknown>).message)
          : `Chainrails quote failed (${upstream.status}).`;
      return NextResponse.json({ error: message }, { status: upstream.status });
    }

    const result =
      data && typeof data === "object"
        ? (data as Record<string, unknown>)
        : null;
    const quotes = result?.quotes;
    const hasQuote =
      Boolean(result?.recommended) ||
      (Array.isArray(quotes) && quotes.length > 0);
    if (!hasQuote) {
      console.warn("[chainrails] off-ramp quote unavailable (422)", {
        fiatCurrency: params.get("fiatCurrency"),
        cryptoAmount: params.get("cryptoAmount"),
        sourceChain: params.get("sourceChain"),
        countryCode: params.get("countryCode"),
        response: data,
      });
      // Empty quotes means the amount is outside the provider's fillable range
      // — could be under the min or over the max, and we can't tell which from
      // here, so stay neutral rather than pointing the wrong way.
      return NextResponse.json(
        {
          error:
            "No provider can fill that amount right now — try a different amount.",
        },
        { status: 422 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("[chainrails] off-ramp quote request failed", error);
    return NextResponse.json(
      { error: "Couldn't reach Chainrails for an off-ramp quote." },
      { status: 502 }
    );
  }
}
