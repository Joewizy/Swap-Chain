/**
 * Chat routing types — the contract between the assistant (`POST /api/chat`)
 * and whichever client renders the conversation (web or mobile).
 *
 * This is the canonical home of these types. The web app re-exports them from
 * `@/assistant/types`; the mobile app imports them from `@railglide/shared`.
 * Keeping one definition here is what stops the two heads from drifting on the
 * intent/flow contract.
 *
 * Progression: ChatMessage → ChatReply → FlowLaunch → Intent → Execution
 * (SendScreen's `Intent` — a fully-quoted transfer ready for signing — stays
 * co-located with the client that signs it.)
 */

/** The three guided flows a reply can hand off to. */
export type FlowId = "cashout" | "buy" | "bridge";

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
  /** Chain the user named (e.g. "polygon"), resolved to a source chain by the flow. */
  chain?: string;
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
