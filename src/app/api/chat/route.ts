import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type { AssistantTurn, ChatMessage } from "@/assistant/types";
import { buildAssistantSystemPrompt } from "@/assistant/productRules";

const apiKey = process.env.OPENAI_API_KEY ?? process.env.OPEN_API_KEY;
const baseURL =
  process.env.OPENAI_BASE_URL ?? "https://models.github.ai/inference";
const model = process.env.OPENAI_MODEL ?? "openai/gpt-4o-mini";

if (!apiKey) {
  console.warn("[chat] OPENAI_API_KEY is not set — /api/chat will return 500.");
}

const client = apiKey ? new OpenAI({ apiKey, baseURL }) : null;

const chatSchema = {
  name: "swap_chain_assistant_turn",
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
      targetFlow: {
        type: ["string", "null"],
        enum: ["cashout", "buy", "bridge", null],
      },
      prefill: {
        type: "object",
        additionalProperties: false,
        properties: {
          amount: { type: ["string", "null"] },
          token: { type: ["string", "null"] },
          fromToken: { type: ["string", "null"] },
          toToken: { type: ["string", "null"] },
          currency: { type: ["string", "null"] },
          recipientHint: { type: ["string", "null"] },
          institutionHint: { type: ["string", "null"] },
        },
        required: [
          "amount",
          "token",
          "fromToken",
          "toToken",
          "currency",
          "recipientHint",
          "institutionHint",
        ],
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
    required: ["message", "status", "targetFlow", "prefill", "plan", "missing"],
  },
} as const;

type RawTurn = {
  message: string;
  status: "clarifying" | "ready" | "unsupported";
  targetFlow: "cashout" | "buy" | "bridge" | null;
  prefill: {
    amount: string | null;
    token: string | null;
    fromToken: string | null;
    toToken: string | null;
    currency: string | null;
    recipientHint: string | null;
    institutionHint: string | null;
  };
  plan: string[];
  missing: string[];
};

function normaliseTurn(raw: RawTurn): AssistantTurn {
  const pick = (v: string | null) => (v && v.trim() ? v.trim() : undefined);
  return {
    message: raw.message,
    status: raw.status,
    targetFlow: raw.targetFlow,
    prefill: {
      amount: pick(raw.prefill.amount),
      token: pick(raw.prefill.token)?.toUpperCase(),
      fromToken: pick(raw.prefill.fromToken)?.toUpperCase(),
      toToken: pick(raw.prefill.toToken)?.toUpperCase(),
      currency: pick(raw.prefill.currency)?.toUpperCase(),
      recipientHint: pick(raw.prefill.recipientHint),
      institutionHint: pick(raw.prefill.institutionHint)?.toLowerCase(),
    },
    plan: raw.plan ?? [],
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

    const raw = JSON.parse(content) as RawTurn;
    return NextResponse.json(normaliseTurn(raw));
  } catch (err) {
    console.error("[chat] error:", err);

    if (err instanceof OpenAI.APIError) {
      if (err.status === 401 || err.status === 403) {
        const host = new URL(baseURL).host;
        return NextResponse.json(
          {
            error:
              `Assistant auth rejected by ${host} (HTTP ${err.status}). ` +
              `Check OPENAI_API_KEY matches OPENAI_BASE_URL.`,
          },
          { status: 502 }
        );
      }
      return NextResponse.json(
        { error: `Assistant provider error (${err.status}): ${err.message}` },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to process chat",
      },
      { status: 500 }
    );
  }
}
