/**
 * Chat routing types — distinct from SendScreen's `Intent`, which is a
 * fully-quoted transfer ready for signing (text + Quote).
 *
 * Progression: ChatMessage → ChatReply → FlowLaunch → Intent → Execution
 */

import type { FlowId } from "@/app/components/arc/Home";

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

/** One structured reply from POST /api/chat. */
export type ReplyStatus = "clarifying" | "ready" | "unsupported";

/** Partial fields a guided flow can prefill — amount is optional (entered on the flow UI). */
export type FlowSeed = {
  amount?: string;
  token?: string;
  fromToken?: string;
  toToken?: string;
  currency?: string;
  recipientHint?: string;
  institutionHint?: string;
};

/** Where to go next: flow + seed are always paired. Present on ChatReply when status is ready. */
export type FlowLaunch = FlowSeed & {
  flow: FlowId;
  plan?: string[];
  /** First user message in the thread — attached client-side before navigation. */
  chatSummary?: string;
  /** Resolved client-side from institutionHint (never from the LLM). */
  institution?: string;
  institutionName?: string;
};

export type ChatReply = {
  message: string;
  status: ReplyStatus;
  /** Set only when status is "ready" — guarantees flow and seed stay coupled. */
  launch?: FlowLaunch;
  plan: string[];
  missing: string[];
};
