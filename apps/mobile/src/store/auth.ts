import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import { getSessionAddress } from "@/api/auth";

/**
 * SIWE session state. The HMAC-signed token from /api/auth/verify lives in
 * expo-secure-store (never a private key — just the session token), and the
 * proven wallet address rides alongside it. Protected API calls read `token`
 * and send it as a Bearer header.
 */
const TOKEN_KEY = "railglide.session.token";

type AuthStatus = "loading" | "signed-out" | "signed-in";

interface AuthState {
  token: string | null;
  address: string | null;
  status: AuthStatus;
  /** Load a saved token on launch and validate it against the backend. */
  hydrate: () => Promise<void>;
  /** Persist a freshly minted session. */
  setSession: (token: string, address: string) => Promise<void>;
  /** Drop the session (logout / wallet disconnect). */
  clear: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  token: null,
  address: null,
  status: "loading",

  hydrate: async () => {
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!token) {
        set({ status: "signed-out" });
        return;
      }
      // A stored token can be expired/invalid — confirm with the backend.
      const { address } = await getSessionAddress(token);
      if (address) {
        set({ token, address, status: "signed-in" });
      } else {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
        set({ token: null, address: null, status: "signed-out" });
      }
    } catch {
      // Backend unreachable — treat as signed-out but keep the stored token so
      // a later launch can retry.
      set({ status: "signed-out" });
    }
  },

  setSession: async (token, address) => {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    set({ token, address, status: "signed-in" });
  },

  clear: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    set({ token: null, address: null, status: "signed-out" });
  },
}));
