import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Recipients — a device-local address book of fiat payout targets (bank /
 * mobile money). Mirrors the web app's `recipients.ts`, swapping localStorage
 * for AsyncStorage. Names never leave the device: the intent flow resolves
 * "send to mum" against this store rather than handing PII to the model.
 *
 * The `Recipient` shape is kept identical to web so the two clients stay
 * interchangeable; if it needs to be a hard contract later, hoist it into
 * @railglide/shared.
 */
export type Recipient = {
  /** `${institution}:${accountIdentifier}` — also the dedup key. */
  id: string;
  name: string;
  currency: string;
  institution: string;
  institutionName: string;
  accountIdentifier: string;
  accountName: string;
  /** Epoch ms of the last send / save. */
  lastUsed: number;
};

const RECIPIENTS_KEY = "railglide:recipients";

export function recipientId(
  institution: string,
  accountIdentifier: string
): string {
  return `${institution}:${accountIdentifier.trim()}`;
}

interface RecipientsState {
  recipients: Recipient[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  upsert: (r: Omit<Recipient, "id" | "lastUsed">) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

async function persist(list: Recipient[]): Promise<void> {
  try {
    await AsyncStorage.setItem(RECIPIENTS_KEY, JSON.stringify(list));
  } catch {
    // storage unavailable — recipients won't persist this session.
  }
}

export const useRecipients = create<RecipientsState>((set, get) => ({
  recipients: [],
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(RECIPIENTS_KEY);
      const list = raw ? (JSON.parse(raw) as Recipient[]) : [];
      set({ recipients: Array.isArray(list) ? list : [], hydrated: true });
    } catch {
      set({ recipients: [], hydrated: true });
    }
  },

  upsert: async (input) => {
    const accountIdentifier = input.accountIdentifier.trim();
    if (!input.institution || !accountIdentifier || !input.currency) return;

    const id = recipientId(input.institution, accountIdentifier);
    const entry: Recipient = {
      ...input,
      id,
      accountIdentifier,
      name: input.name || accountIdentifier,
      currency: input.currency.toUpperCase(),
      lastUsed: Date.now(),
    };
    const rest = get().recipients.filter((r) => r.id !== id);
    const next = [entry, ...rest];
    set({ recipients: next });
    await persist(next);
  },

  remove: async (id) => {
    const next = get().recipients.filter((r) => r.id !== id);
    set({ recipients: next });
    await persist(next);
  },
}));

/**
 * Resolve a free-text recipient (a name like "mum", or an account number)
 * against a saved list. Currency-filtered when known. Pure — never sends names
 * to the LLM. Used by the intent handoff to prefill a payout.
 */
export function matchRecipient(
  list: Recipient[],
  query: string | null,
  currency?: string | null
): Recipient | null {
  if (!query) return null;
  const q = query.trim().toLowerCase();
  if (!q) return null;

  const candidates = list.filter(
    (r) => !currency || r.currency === currency.toUpperCase()
  );

  const byNumber = candidates.find(
    (r) => r.accountIdentifier.trim().toLowerCase() === q
  );
  if (byNumber) return byNumber;

  return (
    candidates
      .filter((r) => {
        const name = r.name.toLowerCase();
        return name.includes(q) || q.includes(name);
      })
      .sort((a, b) => b.lastUsed - a.lastUsed)[0] ?? null
  );
}
