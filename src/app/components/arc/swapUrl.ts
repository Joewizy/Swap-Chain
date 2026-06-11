import type {
  AssistantHandoff,
  AssistantTurn,
  ChatMessage,
} from "@/assistant/types";
import type { FlowId } from "./Home";
import type { Intent, PayoutDetails, Quote } from "./SendScreen";

export type SwapView = "send" | "history" | "recipients" | "settings";
export type FlowStep = "compose" | "review";

const FLOW_IDS = new Set<string>(["cashout", "buy", "bridge", "describe"]);
const VIEW_IDS = new Set<string>(["history", "recipients", "settings"]);

export const SWAP_INTENT_STORAGE_KEY = "swap-chain:intent";
export const SWAP_FLOW_DRAFT_KEY = "swap-chain:flow-draft";
export const ASSISTANT_PREFILL_KEY = "swap-chain:assistant-prefill";
export const ASSISTANT_CHAT_KEY = "swap-chain:assistant-chat";

/** Persisted chat transcript so the conversation survives a refresh. */
export type ChatState = { messages: ChatMessage[]; lastTurn: AssistantTurn | null };

/** Persisted guided-flow state (cash out / buy) so review survives refresh. */
export type FlowDraft = {
  flow: "cashout" | "buy";
  amount: string;
  currency: string;
  token?: string;
  quote: Quote;
  label: string;
  payout?: PayoutDetails;
  /** When this draft was last persisted; used to re-fetch stale rates. */
  ts?: number;
};

/** True when a restored draft's rate is old enough to be worth re-fetching. */
export const RATE_STALE_MS = 60_000;

export function isDraftStale(draft: FlowDraft, now = Date.now()): boolean {
  return !draft.ts || now - draft.ts > RATE_STALE_MS;
}

export function parseFlow(
  raw: string | null
): FlowId | "describe" | null {
  if (raw && FLOW_IDS.has(raw)) return raw as FlowId | "describe";
  return null;
}

export function parseView(raw: string | null): SwapView {
  if (raw && VIEW_IDS.has(raw)) return raw as SwapView;
  return "send";
}

export function parseStep(raw: string | null): FlowStep {
  return raw === "review" ? "review" : "compose";
}

/** Apply a partial update to the current /swap query string. */
export function mergeSwapSearchParams(
  current: URLSearchParams,
  patch: {
    view?: SwapView | null;
    flow?: FlowId | "describe" | null;
    status?: boolean | null;
    step?: FlowStep | null;
  }
): string {
  const params = new URLSearchParams(current.toString());

  if (patch.view !== undefined) {
    if (patch.view === null || patch.view === "send") params.delete("view");
    else params.set("view", patch.view);
  }
  if (patch.flow !== undefined) {
    if (patch.flow === null) params.delete("flow");
    else params.set("flow", patch.flow);
  }
  if (patch.status !== undefined) {
    if (patch.status) params.set("status", "1");
    else params.delete("status");
  }
  if (patch.step !== undefined) {
    if (patch.step === null || patch.step === "compose") params.delete("step");
    else params.set("step", patch.step);
  }

  return params.toString();
}

export function loadStoredIntent(): Intent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SWAP_INTENT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Intent;
  } catch {
    return null;
  }
}

export function storeIntent(intent: Intent): void {
  try {
    sessionStorage.setItem(SWAP_INTENT_STORAGE_KEY, JSON.stringify(intent));
  } catch {
    // sessionStorage unavailable — status won't survive refresh
  }
}

export function clearStoredIntent(): void {
  try {
    sessionStorage.removeItem(SWAP_INTENT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function loadFlowDraft(): FlowDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SWAP_FLOW_DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as FlowDraft;
  } catch {
    return null;
  }
}

export function storeFlowDraft(draft: FlowDraft): void {
  try {
    const stamped: FlowDraft = { ...draft, ts: Date.now() };
    sessionStorage.setItem(SWAP_FLOW_DRAFT_KEY, JSON.stringify(stamped));
  } catch {
    // ignore
  }
}

export function clearFlowDraft(): void {
  try {
    sessionStorage.removeItem(SWAP_FLOW_DRAFT_KEY);
  } catch {
    // ignore
  }
}

export function storeAssistantPrefill(handoff: AssistantHandoff): void {
  try {
    sessionStorage.setItem(ASSISTANT_PREFILL_KEY, JSON.stringify(handoff));
  } catch {
    // ignore
  }
}

export function loadAssistantPrefill(): AssistantHandoff | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ASSISTANT_PREFILL_KEY);
    return raw ? (JSON.parse(raw) as AssistantHandoff) : null;
  } catch {
    return null;
  }
}

export function clearAssistantPrefill(): void {
  try {
    sessionStorage.removeItem(ASSISTANT_PREFILL_KEY);
  } catch {
    // ignore
  }
}

// --- chat transcript (survives refresh) ---------------------------------

export function storeChatState(state: ChatState): void {
  try {
    sessionStorage.setItem(ASSISTANT_CHAT_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function loadChatState(): ChatState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ASSISTANT_CHAT_KEY);
    return raw ? (JSON.parse(raw) as ChatState) : null;
  } catch {
    return null;
  }
}

export function clearChatState(): void {
  try {
    sessionStorage.removeItem(ASSISTANT_CHAT_KEY);
  } catch {
    // ignore
  }
}
