import { create } from "zustand";
import type { FlowLaunch } from "@railglide/shared/assistant/types";

/** An order handed from History to its flow screen to resume/view. */
export interface ResumeOrder {
  id: string;
  direction: "onramp" | "offramp";
  /** Token + Paycrest network slug — let Sell rebuild the wallet funding context. */
  token?: string;
  network?: string;
  /**
   * Set for ChainRails ramp orders — the ChainRails chain enum
   * (e.g. "SOLANA_MAINNET"). Its presence marks this as a ChainRails resume
   * rather than a Paycrest one.
   */
  chainrailsChain?: string;
}

// Client/UI state. `pendingLaunch` carries a ready FlowLaunch from the intent
// chat into the flow screen (the chat → flow handoff). `resumeOrder` carries a
// tapped History order into its flow screen (Buy / Cash out).
interface SessionState {
  address: string | null;
  pendingLaunch: FlowLaunch | null;
  resumeOrder: ResumeOrder | null;
  setAddress: (address: string | null) => void;
  setPendingLaunch: (launch: FlowLaunch | null) => void;
  setResumeOrder: (order: ResumeOrder | null) => void;
}

export const useSession = create<SessionState>((set) => ({
  address: null,
  pendingLaunch: null,
  resumeOrder: null,
  setAddress: (address) => set({ address }),
  setPendingLaunch: (pendingLaunch) => set({ pendingLaunch }),
  setResumeOrder: (resumeOrder) => set({ resumeOrder }),
}));
