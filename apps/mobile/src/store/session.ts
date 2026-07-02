import { create } from "zustand";
import type { FlowLaunch } from "@railglide/shared/assistant/types";

/**
 * Client/UI state (mirrors the web store choice: Zustand).
 *
 * `pendingLaunch` carries a ready `FlowLaunch` from the intent chat into the
 * guided flow screen — the mobile analogue of the web app's chat → flow
 * handoff. Wallet address is set once the wallet step of Phase 0 lands.
 */
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
