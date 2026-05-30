import { NextRequest, NextResponse } from "next/server";
import { Chainrails, crapi } from "@chainrails/sdk";
import type { AmountSymbol, Chain } from "@chainrails/sdk";

/**
 * POST /api/chainrails/quote
 *
 * Best cross-bridge quote for a Chainrails-funded route. The SDK needs
 * the API key, so this call stays server-side — the useChainrails hook
 * posts here. Chain names are the Chainrails `{CHAIN}_{TESTNET|MAINNET}`
 * enum; map app ChainIds with src/rails/chainrails.ts before calling.
 *
 * Body: { sourceChain, destinationChain, tokenIn, tokenOut, amount,
 *         recipient, amountSymbol? }
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
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const required = [
    "sourceChain",
    "destinationChain",
    "tokenIn",
    "tokenOut",
    "amount",
    "recipient",
  ] as const;
  const missing = required.filter((k) => !body[k]);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing required field(s): ${missing.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    Chainrails.config({ api_key: apiKey });
    const quote = await crapi.quotes.getBestAcrossBridges({
      sourceChain: body.sourceChain as Chain,
      destinationChain: body.destinationChain as Chain,
      tokenIn: body.tokenIn as `0x${string}`,
      tokenOut: body.tokenOut as `0x${string}`,
      amount: String(body.amount),
      recipient: body.recipient as `0x${string}`,
      amountSymbol: (body.amountSymbol as AmountSymbol) ?? ("USDC" as AmountSymbol),
    });
    return NextResponse.json(quote);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Chainrails quote failed",
      },
      { status: 502 }
    );
  }
}
