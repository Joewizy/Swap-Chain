import { NextRequest, NextResponse } from "next/server";
import { parseUnits } from "viem";
import {
  ACTIVE_CHAINS,
  IS_MAINNET,
  getChain,
  getToken,
  getTokenAddress,
  resolveChain,
  resolveToken,
  type ChainEntry,
} from "@/config/network";
import { relayAppFees } from "@/config/fees";

const RELAY_API = IS_MAINNET
  ? "https://api.relay.link"
  : "https://api.testnets.relay.link";

export async function POST(request: NextRequest) {
  try {
    const {
      sourceChain,
      targetChain,
      token,
      destinationToken,
      amount,
      userAddress,
      recipient,
    } = await request.json();

    if (!sourceChain || !targetChain || !token || !amount || !userAddress) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const origin = resolveChainEntry(sourceChain);
    const destination = resolveChainEntry(targetChain);
    if (!origin || !destination) {
      return NextResponse.json(
        {
          error: `Unsupported chain in current ${IS_MAINNET ? "mainnet" : "testnet"} network. Supported: ${ACTIVE_CHAINS.map((c) => c.id).join(", ")}`,
        },
        { status: 400 }
      );
    }

    if (origin.kind !== "evm") {
      return NextResponse.json(
        {
          error:
            "Connected-wallet Relay execution currently requires an EVM source chain.",
        },
        { status: 400 }
      );
    }

    if (destination.kind === "starknet") {
      return NextResponse.json(
        {
          error:
            "Starknet routes are paused until client-side signing is rebuilt.",
        },
        { status: 400 }
      );
    }

    const sellSymbol = resolveToken(token);
    const buySymbol = resolveToken(destinationToken || token);
    if (!sellSymbol || !buySymbol) {
      return NextResponse.json(
        { error: `Unsupported token: ${token}` },
        { status: 400 }
      );
    }

    const sellAddress = getTokenAddress(sellSymbol, origin.id);
    const buyAddress = getTokenAddress(buySymbol, destination.id);
    if (!sellAddress || !buyAddress) {
      return NextResponse.json(
        {
          error: `Token ${sellSymbol}/${buySymbol} not configured on requested chains`,
        },
        { status: 400 }
      );
    }

    if (destination.kind === "solana" && !recipient) {
      return NextResponse.json(
        {
          error:
            "Recipient (Solana address) is required when bridging to Solana.",
        },
        { status: 400 }
      );
    }

    const sellDecimals = getToken(sellSymbol)?.decimals ?? 18;

    // Platform app fee (basis points) paid to our fee wallet, if configured.
    const appFees = relayAppFees();

    const quoteResponse = await fetch(`${RELAY_API}/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user: userAddress,
        recipient: destination.kind === "solana" ? recipient : undefined,
        originChainId: origin.numericId,
        destinationChainId: destination.numericId,
        originCurrency: sellAddress,
        destinationCurrency: buyAddress,
        amount: parseUnits(String(amount), sellDecimals).toString(),
        tradeType: "EXACT_INPUT",
        ...(appFees ? { appFees } : {}),
      }),
    });

    if (!quoteResponse.ok) {
      const errorText = await quoteResponse.text();
      throw new Error(
        `Failed to getQuote: ${quoteResponse.status} - ${errorText}`
      );
    }

    const quoteData = await quoteResponse.json();

    return NextResponse.json({
      success: true,
      requestId: quoteData.steps?.[0]?.requestId,
      amount,
      token: sellSymbol,
      fromChain: origin.id,
      toChain: destination.id,
      status: "pending",
      steps: quoteData.steps,
      quote: quoteData,
    });
  } catch (error) {
    console.error("Quote error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

function resolveChainEntry(input: string): ChainEntry | undefined {
  const id = resolveChain(input);
  if (!id) return undefined;
  const entry = getChain(id);
  if (!entry) return undefined;
  // Reject chains outside the active network universe
  if (entry.isTestnet === IS_MAINNET) return undefined;
  return entry;
}
