import { create } from "zustand";
import type { FlowLaunch } from "@railglide/shared/assistant/types";

// Client/UI state. `pendingLaunch` carries a ready FlowLaunch from the intent
// chat into the flow screen (the chat → flow handoff).
interface SessionState {
  address: string | null;
  pendingLaunch: FlowLaunch | null;
  setAddress: (address: string | null) => void;
  setPendingLaunch: (launch: FlowLaunch | null) => void;
}

export const useSession = create<SessionState>((set) => ({
  address: null,
  pendingLaunch: null,
  setAddress: (address) => set({ address }),
  setPendingLaunch: (pendingLaunch) => set({ pendingLaunch }),
}));
