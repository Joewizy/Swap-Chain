import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Device-local record of ChainRails ramp orders created on this phone. Mirrors
// web's chainrailsOrders.ts: ChainRails' list endpoint is account-wide (scoped
// to our API key), not per-user, and ChainRails buys need no connected wallet —
// so we remember the ids here and re-fetch each order's live status for History
// and for resuming an order instead of creating a duplicate.
export type RampOrderRecord = {
  id: string;
  direction: "onramp" | "offramp";
  /** ChainRails chain enum, e.g. "SOLANA_MAINNET" — used to resume the flow. */
  chainrailsChain: string;
  /** Display name, e.g. "Solana". */
  chainLabel: string;
  /** e.g. "35.6 USDC". */
  cryptoLabel: string;
  /** e.g. "50,000 NGN". */
  fiatLabel?: string;
  /** Recipient (on-ramp) or sender (off-ramp) address. */
  address?: string;
  /** Hosted checkout URL, so a resumed order can reopen it. */
  widgetUrl?: string;
  /** Last known raw status string. */
  status?: string;
  createdAt: number;
};

const KEY = "railglide:rampOrders";
const MAX = 30;

interface RampOrdersState {
  orders: RampOrderRecord[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  track: (order: RampOrderRecord) => Promise<void>;
  setStatus: (id: string, status: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

async function persist(list: RampOrderRecord[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // storage unavailable — orders won't persist this session.
  }
}

export const useRampOrders = create<RampOrdersState>((set, get) => ({
  orders: [],
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const list = raw ? (JSON.parse(raw) as RampOrderRecord[]) : [];
      set({ orders: Array.isArray(list) ? list : [], hydrated: true });
    } catch {
      set({ orders: [], hydrated: true });
    }
  },

  // Newest first, deduped by id, capped.
  track: async (order) => {
    const rest = get().orders.filter((o) => o.id !== order.id);
    const next = [order, ...rest].slice(0, MAX);
    set({ orders: next });
    await persist(next);
  },

  setStatus: async (id, status) => {
    let changed = false;
    const next = get().orders.map((o) => {
      if (o.id !== id || o.status === status) return o;
      changed = true;
      return { ...o, status };
    });
    if (!changed) return;
    set({ orders: next });
    await persist(next);
  },

  remove: async (id) => {
    const next = get().orders.filter((o) => o.id !== id);
    set({ orders: next });
    await persist(next);
  },
}));
