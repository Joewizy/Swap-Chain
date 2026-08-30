// On-device draft persistence for the guided flows — the mobile counterpart to
// the web's sessionStorage compose drafts. Saves what the user has typed so
// leaving a flow (or the app being killed) doesn't wipe a half-filled form; the
// draft is cleared once the order is created.
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ComposeFlow = "buy" | "cashout";

/** Raw compose-form inputs for the Paycrest Buy / Sell flows. */
export type ComposeDraft = {
  amount?: string;
  currency?: string;
  token?: string;
  /** Buy: the receive chain. Sell: the source chain. A ChainId. */
  chain?: string;
  /** ChainRails corridor chain (Buy only), when a non-Paycrest chain is picked. */
  crChain?: string;
};

/** ChainRails Buy-panel inputs, kept per corridor chain. */
export type ChainrailsRampDraft = {
  amount?: string;
  countryCode?: string;
  fields?: Record<string, string>;
  /** The delivery address the user pasted (mobile collects it inline). */
  address?: string;
};

const composeKey = (flow: ComposeFlow) => `railglide:compose:${flow}`;
const crRampKey = (chain: string) => `railglide:cr-ramp:${chain}`;

async function loadJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function saveJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable — the draft just won't persist.
  }
}

async function remove(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export const loadComposeDraft = (flow: ComposeFlow) =>
  loadJson<ComposeDraft>(composeKey(flow));
export const saveComposeDraft = (flow: ComposeFlow, draft: ComposeDraft) =>
  saveJson(composeKey(flow), draft);
export const clearComposeDraft = (flow: ComposeFlow) => remove(composeKey(flow));

// The KYC/contact email is reused across every ramp order, so it lives on its
// own key (not the per-chain draft, which is cleared once an order is created).
const EMAIL_KEY = "railglide:ramp:email";
export const loadSavedEmail = () => loadJson<string>(EMAIL_KEY);
export const saveSavedEmail = (email: string) =>
  saveJson(EMAIL_KEY, email.trim());

export const loadChainrailsRampDraft = (chain: string) =>
  loadJson<ChainrailsRampDraft>(crRampKey(chain));
export const saveChainrailsRampDraft = (
  chain: string,
  draft: ChainrailsRampDraft
) => saveJson(crRampKey(chain), draft);
export const clearChainrailsRampDraft = (chain: string) =>
  remove(crRampKey(chain));
