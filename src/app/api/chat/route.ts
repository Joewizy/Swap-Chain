import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type { ChatMessage, ChatReply, FlowLaunch, FlowSeed } from "@/assistant/types";
import {
  buildAssistantSystemPrompt,
  isSettlementToken,
} from "@/assistant/productRules";

const apiKey = process.env.OPENAI_API_KEY ?? process.env.OPEN_API_KEY;
const baseURL =
  process.env.OPENAI_BASE_URL ?? "https://models.github.ai/inference";
const model = process.env.OPENAI_MODEL ?? "openai/gpt-4o-mini";

if (!apiKey) {
  console.warn("[chat] OPENAI_API_KEY is not set — /api/chat will return 500.");
}

const client = apiKey ? new OpenAI({ apiKey, baseURL }) : null;

const seedSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    amount: { type: ["string", "null"] },
    token: { type: ["string", "null"] },
    fromToken: { type: ["string", "null"] },
    toToken: { type: ["string", "null"] },
    currency: { type: ["string", "null"] },
    chain: { type: ["string", "null"] },
    recipientHint: { type: ["string", "null"] },
    institutionHint: { type: ["string", "null"] },
  },
  required: [
    "amount",
    "token",
    "fromToken",
    "toToken",
    "currency",
    "chain",
    "recipientHint",
    "institutionHint",
  ],
} as const;

const chatSchema = {
  name: "swap_chain_chat_reply",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      message: {
        type: "string",
        description: "User-facing assistant reply — warm, specific, conversational.",
      },
      status: {
        type: "string",
        enum: ["clarifying", "ready", "unsupported"],
      },
      launch: {
        type: ["object", "null"],
        additionalProperties: false,
        properties: {
          flow: {
            type: "string",
            enum: ["cashout", "buy", "bridge"],
          },
          seed: seedSchema,
        },
        required: ["flow", "seed"],
      },
      plan: {
        type: "array",
        items: { type: "string" },
      },
      missing: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["message", "status", "launch", "plan", "missing"],
  },
} as const;

type RawSeed = {
  amount: string | null;
  token: string | null;
  fromToken: string | null;
  toToken: string | null;
  currency: string | null;
  chain: string | null;
  recipientHint: string | null;
  institutionHint: string | null;
};

type RawReply = {
  message: string;
  status: "clarifying" | "ready" | "unsupported";
  launch: { flow: "cashout" | "buy" | "bridge"; seed: RawSeed } | null;
  plan: string[];
  missing: string[];
};

function normaliseSeed(raw: RawSeed): FlowSeed {
  const pick = (v: string | null) => (v && v.trim() ? v.trim() : undefined);
  return {
    amount: pick(raw.amount),
    token: pick(raw.token)?.toUpperCase(),
    fromToken: pick(raw.fromToken)?.toUpperCase(),
    toToken: pick(raw.toToken)?.toUpperCase(),
    currency: pick(raw.currency)?.toUpperCase(),
    chain: pick(raw.chain)?.toLowerCase(),
    recipientHint: pick(raw.recipientHint),
    institutionHint: pick(raw.institutionHint)?.toLowerCase(),
  };
}

function normaliseReply(raw: RawReply): ChatReply {
  let launch: FlowLaunch | undefined;
  let message = raw.message;
  let plan = raw.plan ?? [];

  if (raw.status === "ready" && raw.launch?.flow) {
    launch = { flow: raw.launch.flow, ...normaliseSeed(raw.launch.seed) };

    // Safety net over the prompt: the model sometimes invents a USDC↔USDT
    // "swap" when the user just wants to cash out a stablecoin. Two settlement
    // tokens is never a real swap — reroute straight to cashout and drop the
    // bogus swap step and message.
    if (
      launch.flow === "bridge" &&
      isSettlementToken(launch.fromToken) &&
      isSettlementToken(launch.toToken)
    ) {
      const token = launch.fromToken;
      launch = { ...launch, flow: "cashout", token, fromToken: undefined, toToken: undefined };
      plan = [];
      message = `You can cash out your ${token} directly — no swap needed. Let's set it up.`;
    }
  }

  return {
    message,
    status: raw.status,
    launch,
    plan,
    missing: raw.missing ?? [],
  };
}

export async function POST(req: NextRequest) {
  if (!client) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured on the server." },
      { status: 500 }
    );
  }

  try {
    const body = (await req.json()) as { messages?: ChatMessage[] };
    const messages = body.messages;
    if (!messages?.length) {
      return NextResponse.json(
        { error: "No messages provided" },
        { status: 400 }
      );
    }

    const completion = await client.chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 800,
      messages: [
        { role: "system", content: buildAssistantSystemPrompt() },
        ...messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ],
      response_format: { type: "json_schema", json_schema: chatSchema },
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty response from model");

    const raw = JSON.parse(content) as RawReply;
    return NextResponse.json(normaliseReply(raw));
  } catch (err) {
    // Full detail (status, host, message) stays in the server log for us;
    // the user only ever sees the calm, non-leaky copy below.
    console.error("[chat] error:", err);

    if (err instanceof OpenAI.APIError) {
      // A connection/DNS/timeout failure has no HTTP status — the model host
      // was unreachable, which is almost always a network blip, not the user.
      if (err.status === undefined) {
        return NextResponse.json(
          {
            error:
              "The assistant is unreachable right now — check your connection and try again.",
          },
          { status: 503 }
        );
      }
      // Any real API rejection (auth, rate limit, bad request). Specifics are
      // logged above; we fix config, the user just retries.
      return NextResponse.json(
        {
          error:
            "The assistant is having trouble right now — please try again in a moment.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { error: "Couldn't process that — please try again." },
      { status: 500 }
    );
  }
}
