import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import {
  ACTIVE_CHAINS,
  ACTIVE_TOKENS,
  CHAIN_ALIASES,
  IS_MAINNET,
  resolveChain,
  resolveToken,
  type ChainId,
  type TokenSymbol,
} from "@/config/network";
import { PAYCREST_FIAT } from "@/rails/paycrest";


const apiKey = process.env.OPENAI_API_KEY ?? process.env.OPEN_API_KEY;
const baseURL = process.env.OPENAI_BASE_URL ?? "https://models.github.ai/inference";
const model = process.env.OPENAI_MODEL ?? "openai/gpt-4o-mini";

if (!apiKey) {
  console.warn(
    "[intent] OPENAI_API_KEY is not set — /api/intent will return 500."
  );
}

const client = apiKey ? new OpenAI({ apiKey, baseURL }) : null;

// ---------------------------------------------------------------------------
// Structured-outputs schema
// ---------------------------------------------------------------------------

const intentSchema = {
  name: "swap_chain_intent",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      action: {
        type: "string",
        enum: ["onramp", "offramp", "bridge", "swap", "unclear"],
        description:
          "onramp = fiat to crypto. offramp = crypto to fiat (bank/mobile money). bridge = crypto across chains. swap = crypto for different token.",
      },
      fromChain: { type: ["string", "null"] },
      fromToken: { type: ["string", "null"] },
      fromAmount: {
        type: ["string", "null"],
        description: 'Decimal amount as a string, e.g. "1.5" or "100".',
      },
      toChain: { type: ["string", "null"] },
      toToken: { type: ["string", "null"] },
      fiatCurrency: {
        type: ["string", "null"],
        description: "ISO code, e.g. NGN, KES, GHS, UGX, XOF.",
      },
      recipient: {
        type: ["string", "null"],
        description:
          "Wallet address, bank account number, or phone number for mobile money. Null when not specified.",
      },
      needsClarification: { type: "boolean" },
      clarificationQuestion: { type: ["string", "null"] },
      confidence: {
        type: "number",
        description: "0–1 model confidence in the extraction.",
      },
    },
    required: [
      "action",
      "fromChain",
      "fromToken",
      "fromAmount",
      "toChain",
      "toToken",
      "fiatCurrency",
      "recipient",
      "needsClarification",
      "clarificationQuestion",
      "confidence",
    ],
  },
} as const;

type RawIntent = {
  action: "onramp" | "offramp" | "bridge" | "swap" | "unclear";
  fromChain: string | null;
  fromToken: string | null;
  fromAmount: string | null;
  toChain: string | null;
  toToken: string | null;
  fiatCurrency: string | null;
  recipient: string | null;
  needsClarification: boolean;
  clarificationQuestion: string | null;
  confidence: number;
};

type NormalisedIntent = {
  action: RawIntent["action"];
  fromChain: ChainId | null;
  fromToken: TokenSymbol | null;
  fromAmount: string | null;
  toChain: ChainId | null;
  toToken: TokenSymbol | null;
  fiatCurrency: string | null;
  recipient: string | null;
  needsClarification: boolean;
  clarificationQuestion: string | null;
  confidence: number;
};

function buildSystemPrompt(): string {
  const chains = ACTIVE_CHAINS.map((c) => c.id).join(", ");
  const tokens = ACTIVE_TOKENS.map((t) => t.symbol).join(", ");
  const aliases = Object.entries(CHAIN_ALIASES)
    .map(([k, v]) => `"${k}" → ${v}`)
    .join("; ");

  return `You convert natural-language crypto requests into a structured intent for a global cross-chain payments app.

Network mode: ${IS_MAINNET ? "mainnet" : "testnet"}.
Supported chains: ${chains}.
Supported tokens: ${tokens}.
Supported fiat (off-ramp): ${PAYCREST_FIAT.join(", ")}.

Chain aliases the user might say: ${aliases}.

Action semantics:
- onramp:  user wants fiat → crypto (e.g. "buy 100 USDC with naira").
- offramp: user wants crypto → fiat to a bank or mobile-money account (e.g. "send 50,000 NGN to my mum's Opay", "withdraw 100 USDC to KES bank").
- bridge:  user wants the same token on a different chain (e.g. "move USDC from Base to Arbitrum").
- swap:    user wants a different token (same or different chain).
- unclear: greeting, vague question, or insufficient info.

Recipient extraction:
- Wallet addresses: 0x… (EVM), base58 (Solana), 0x07… (Starknet).
- Bank or mobile-money payout details: capture phone number with country code (+234…, +254…) or provider/account hints such as "Opay 8012345678".
- If the user names a person ("send to mum") without details, leave recipient null and set needsClarification.

Always set confidence between 0 and 1. If anything required for routing is missing, set needsClarification=true and ask one short, specific clarificationQuestion.`;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  if (!client) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured on the server." },
      { status: 500 }
    );
  }

  try {
    const { message } = (await req.json()) as { message?: string };
    if (!message) {
      return NextResponse.json(
        { error: "No message provided" },
        { status: 400 }
      );
    }

    const completion = await client.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: 600,
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: message },
      ],
      response_format: { type: "json_schema", json_schema: intentSchema },
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty response from model");

    const raw = JSON.parse(content) as RawIntent;
    const normalised = normalise(raw);

    return NextResponse.json(normalised);
  } catch (err) {
    console.error("[intent] error:", err);

    // Surface upstream auth failures clearly — bare "401 Unauthorized" in
    // the UI is unactionable; users need to know which env var to fix.
    if (err instanceof OpenAI.APIError) {
      if (err.status === 401 || err.status === 403) {
        const host = new URL(baseURL).host;
        return NextResponse.json(
          {
            error: `Intent parser auth rejected by ${host} (HTTP ${err.status}). ` +
              `Check that OPENAI_API_KEY matches OPENAI_BASE_URL — the default is ` +
              `GitHub Models (needs a GitHub PAT with the "models:read" scope). ` +
              `For OpenAI directly, set OPENAI_BASE_URL=https://api.openai.com/v1.`,
          },
          { status: 502 }
        );
      }
      return NextResponse.json(
        { error: `Intent provider error (${err.status}): ${err.message}` },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to process intent",
      },
      { status: 500 }
    );
  }
}

function normalise(raw: RawIntent): NormalisedIntent {
  return {
    action: raw.action,
    fromChain: raw.fromChain ? (resolveChain(raw.fromChain) ?? null) : null,
    fromToken: raw.fromToken ? (resolveToken(raw.fromToken) ?? null) : null,
    fromAmount: raw.fromAmount,
    toChain: raw.toChain ? (resolveChain(raw.toChain) ?? null) : null,
    toToken: raw.toToken ? (resolveToken(raw.toToken) ?? null) : null,
    fiatCurrency: raw.fiatCurrency ? raw.fiatCurrency.toUpperCase() : null,
    recipient: raw.recipient,
    needsClarification: raw.needsClarification,
    clarificationQuestion: raw.clarificationQuestion,
    confidence: raw.confidence,
  };
}
