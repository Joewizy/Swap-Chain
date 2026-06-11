/**
 * Client-side institution fuzzy-match for mobile-money / bank hints from chat.
 * No PII is sent to the LLM — only provider names like "opay".
 */

import type { PayoutDetails } from "@/app/components/arc/SendScreen";

export type Institution = {
  name: string;
  code: string;
  type: string;
};

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Common abbreviations → a substring of the official Paycrest name. Bare
 * fuzzy matching can't know "gtbank" = "Guaranty Trust Bank", so we expand the
 * hint first. Anything not listed falls through to substring matching.
 */
const HINT_ALIASES: Record<string, string> = {
  gt: "guaranty trust",
  gtb: "guaranty trust",
  gtbank: "guaranty trust",
  gtbankplc: "guaranty trust",
  uba: "united bank for africa",
  fbn: "first bank",
  firstbank: "first bank",
  zenithbank: "zenith",
  ecobank: "ecobank",
  eco: "ecobank",
  citi: "citibank",
  opay: "opay",
  palmpay: "palmpay",
  kuda: "kuda",
};

/**
 * Match an institution hint (e.g. "opay", "gtbank") against Paycrest's list.
 * Returns the best single match, or null when ambiguous / not confident —
 * we'd rather leave the bank unselected than prefill the wrong one.
 */
export function matchInstitution(
  hint: string | null | undefined,
  institutions: Institution[]
): Institution | null {
  if (!hint || !institutions.length) return null;
  const key = norm(hint);
  if (!key) return null;
  const h = norm(HINT_ALIASES[key] ?? hint);
  if (!h) return null;

  const scored = institutions
    .map((inst) => {
      const name = norm(inst.name); // norm() drops the trailing-space noise too
      let score = 0;
      if (name === h) score = 100;
      else if (name.includes(h)) score = 85; // hint is part of the bank name
      else if (h.includes(name)) score = 70; // bank name is part of the hint
      else if (name.startsWith(h) || h.startsWith(name)) score = 60;
      if (
        inst.type === "mobile_money" &&
        /opay|palmpay|momo|mpesa|moniepoint/i.test(hint)
      ) {
        score += 10;
      }
      return { inst, score };
    })
    .filter((x) => x.score >= 60)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return null;
  if (scored.length > 1 && scored[0].score === scored[1].score) return null;
  return scored[0].inst;
}

/** Build partial payout prefill from a matched institution (account still required). */
export function institutionToPayoutPartial(
  inst: Institution
): Pick<PayoutDetails, "institution" | "institutionName"> {
  return {
    institution: inst.code,
    institutionName: inst.name.trim(),
  };
}

/** Fetch institutions for a currency and resolve hint → payout partial. */
export async function resolveInstitutionHint(
  currency: string,
  hint: string | null | undefined
): Promise<Pick<PayoutDetails, "institution" | "institutionName"> | null> {
  if (!hint || !currency) return null;
  try {
    const res = await fetch(
      `/api/paycrest/institutions?currency=${encodeURIComponent(currency)}`
    );
    const data = await res.json();
    if (!res.ok) return null;
    const list = (data.institutions ?? []) as Institution[];
    const matched = matchInstitution(hint, list);
    return matched ? institutionToPayoutPartial(matched) : null;
  } catch {
    return null;
  }
}
