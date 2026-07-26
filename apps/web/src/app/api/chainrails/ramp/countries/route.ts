import { NextResponse } from "next/server";
import { Chainrails, crapi } from "@chainrails/sdk";

/** Returns Chainrails' live country/currency catalogue for the buy form. */
export async function GET() {
  const apiKey = process.env.CHAINRAILS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "CHAINRAILS_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  try {
    await Chainrails.config({ api_key: apiKey });
    const countries = await crapi.ramp.getCountries();
    return NextResponse.json({ countries });
  } catch (error) {
    // The SDK is axios-based, so it hides Chainrails' real response body inside
    // the error. Surface the upstream status + raw body before mapping to a
    // generic status — same as the Paycrest routes.
    const ax = error as {
      response?: { status?: number; data?: unknown };
      message?: string;
    };
    const status = ax.response?.status;
    const data = ax.response?.data;
    console.error(
      `[chainrails ramp countries] upstream ${status ?? "?"}:`,
      typeof data !== "undefined"
        ? JSON.stringify(data)
        : (ax.message ?? String(error))
    );
    const upstreamMessage =
      data && typeof data === "object" && "message" in data
        ? String((data as Record<string, unknown>).message)
        : error instanceof Error
          ? error.message
          : "Couldn't load supported countries.";
    return NextResponse.json({ error: upstreamMessage }, { status: 502 });
  }
}
