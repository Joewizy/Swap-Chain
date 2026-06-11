/** Shared types for the conversational assistant (client + server). */

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type AssistantFlow = "cashout" | "buy" | "bridge";

export type AssistantStatus = "clarifying" | "ready" | "unsupported";

export type AssistantPrefill = {
  amount?: string;
  token?: string;
  fromToken?: string;
  toToken?: string;
  currency?: string;
  recipientHint?: string;
  institutionHint?: string;
};

export type AssistantTurn = {
  message: string;
  status: AssistantStatus;
  targetFlow: AssistantFlow | null;
  prefill: AssistantPrefill;
  plan: string[];
  missing: string[];
};

/** Stored in sessionStorage when handing off from chat to a guided flow. */
export type AssistantHandoff = {
  flow: AssistantFlow;
  amount?: string;
  token?: string;
  fromToken?: string;
  toToken?: string;
  currency?: string;
  recipientHint?: string;
  institutionHint?: string;
  plan?: string[];
  chatSummary?: string;
  /** Pre-resolved Paycrest institution code (client-side fuzzy match). */
  institution?: string;
  institutionName?: string;
};
