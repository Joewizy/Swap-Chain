"use client";

/**
 * Recipients — a local address book of fiat payout targets (bank / mobile money).
 *
 * Each recipient is a verified PayoutDetails + the currency it pays out in, so a
 * saved entry drops straight into ReviewScreen's `initialPayout`. The list lives
 * in localStorage (device-local, survives sessions); recipient names never leave
 * the browser, so the AI flow resolves "send to mum" against this store rather
 * than handing PII to the model.
 */

import { useEffect, useState } from "react";
import type { PayoutDetails } from "./SendScreen";

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
const PENDING_RECIPIENT_KEY = "railglide:pending-recipient";
/** Fired on same-tab mutations so open screens re-read (storage event only fires cross-tab). */
const CHANGED_EVENT = "recipients:changed";

function recipientId(institution: string, accountIdentifier: string): string {
  return `${institution}:${accountIdentifier.trim()}`;
}

export function loadRecipients(): Recipient[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECIPIENTS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as Recipient[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveRecipients(list: Recipient[]): void {
  try {
    localStorage.setItem(RECIPIENTS_KEY, JSON.stringify(list));
    window.dispatchEvent(new Event(CHANGED_EVENT));
  } catch {
    // localStorage unavailable — recipients won't persist this session.
  }
}

/**
 * Insert or refresh a recipient from a completed payout. Dedups by
 * institution + account number; on a repeat send it just bumps name/lastUsed.
 * Entries missing the institution or account number are ignored.
 */
export function upsertRecipient(
  payout: PayoutDetails,
  currency: string | null
): void {
  const accountIdentifier = payout.accountIdentifier.trim();
  if (!payout.institution || !accountIdentifier || !currency) return;

  const id = recipientId(payout.institution, accountIdentifier);
  const entry: Recipient = {
    id,
    name: payout.accountName || payout.accountIdentifier,
    currency,
    institution: payout.institution,
    institutionName: payout.institutionName,
    accountIdentifier,
    accountName: payout.accountName,
    lastUsed: Date.now(),
  };

  const rest = loadRecipients().filter((r) => r.id !== id);
  saveRecipients([entry, ...rest]);
}

export function removeRecipient(id: string): void {
  saveRecipients(loadRecipients().filter((r) => r.id !== id));
}

/** The PayoutDetails a saved recipient maps back to (for prefill). */
export function recipientToPayout(r: Recipient): PayoutDetails {
  return {
    institution: r.institution,
    institutionName: r.institutionName,
    accountIdentifier: r.accountIdentifier,
    accountName: r.accountName,
  };
}

/**
 * Resolve a free-text recipient (a name like "mum"/"Tunde", or an account
 * number) from the parsed intent against the saved store. Currency-filtered
 * when known. Returns the best match or null — never sends names to the LLM.
 */
export function matchRecipient(
  query: string | null,
  currency?: string | null
): Recipient | null {
  if (!query) return null;
  const q = query.trim().toLowerCase();
  if (!q) return null;

  const candidates = loadRecipients().filter(
    (r) => !currency || r.currency === currency.toUpperCase()
  );

  // Exact account-number match wins outright.
  const byNumber = candidates.find(
    (r) => r.accountIdentifier.trim().toLowerCase() === q
  );
  if (byNumber) return byNumber;

  // Otherwise the most-recently-used name that contains / is contained by q.
  const byName = candidates
    .filter((r) => {
      const name = r.name.toLowerCase();
      return name.includes(q) || q.includes(name);
    })
    .sort((a, b) => b.lastUsed - a.lastUsed);

  return byName[0] ?? null;
}

// ---------------------------------------------------------------------------
// Pending-recipient handoff: Recipients "Send" → CashoutFlow prefill.
// sessionStorage (one-shot, current tab) mirrors the intent/flow-draft pattern.
// ---------------------------------------------------------------------------

export function storePendingRecipient(r: Recipient): void {
  try {
    sessionStorage.setItem(PENDING_RECIPIENT_KEY, JSON.stringify(r));
  } catch {
    // ignore — prefill is a nicety
  }
}

export function loadPendingRecipient(): Recipient | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PENDING_RECIPIENT_KEY);
    return raw ? (JSON.parse(raw) as Recipient) : null;
  } catch {
    return null;
  }
}

export function clearPendingRecipient(): void {
  try {
    sessionStorage.removeItem(PENDING_RECIPIENT_KEY);
  } catch {
    // ignore
  }
}

/** Live recipient list — re-reads on same-tab mutations and cross-tab storage events. */
export function useRecipients(): {
  recipients: Recipient[];
  remove: (id: string) => void;
} {
  const [recipients, setRecipients] = useState<Recipient[]>([]);

  useEffect(() => {
    const sync = () => setRecipients(loadRecipients());
    sync();
    window.addEventListener(CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return { recipients, remove: removeRecipient };
}
