"use client";

/**
 * Client helpers for Chainrails "headless KYC". The user submits the currently-
 * missing fields once (keyed by their email) and the profile is reused across
 * providers. We read the state, render a form from `missingRequirements`, submit
 * the values, then poll until `canProceed` — see the Sell flow's order gate.
 *
 * Nothing here holds the API key; every call goes through /api/chainrails/ramp/kyc.
 */

/** One field the user still has to provide, straight from the provider. */
export type KycRequirement = {
  key: string;
  label: string;
  type: string; // "field" | ... (documents/redirects arrive as capabilities)
  /** "provided" = a stored value is enough; "verified" = checked by an ID source. */
  assurance?: string;
  sensitive?: boolean;
};

/**
 * The KYC state for a corridor. `canProceed` is the gate: when true the order
 * can be created. `requiredCapabilities` lists external flows (e.g.
 * "external_verification") that a plain field form can't satisfy.
 */
export type KycState = {
  canProceed?: boolean;
  blocked?: boolean;
  missingRequirements?: KycRequirement[];
  insufficientRequirements?: KycRequirement[];
  pendingRequirements?: KycRequirement[];
  rejectedRequirements?: KycRequirement[];
  blockedRequirements?: KycRequirement[];
  requiredCapabilities?: string[];
  /** Some responses return a hosted URL for external verification. */
  verificationUrl?: string;
};

export type KycCorridor = {
  provider: string;
  userEmail: string;
  countryCode: string;
  fiatCurrency: string;
  cryptoAmount?: number;
};

/** Fields the user must still supply before the order can go through. */
export function outstandingRequirements(state: KycState): KycRequirement[] {
  return [
    ...(state.missingRequirements ?? []),
    ...(state.insufficientRequirements ?? []),
    ...(state.rejectedRequirements ?? []),
  ];
}

/** A profile that can't proceed with a plain field form needs a redirect flow. */
export function needsExternalVerification(state: KycState): boolean {
  return (state.requiredCapabilities ?? []).some((c) =>
    c.toLowerCase().includes("external")
  );
}

function corridorQuery(c: KycCorridor): string {
  const p = new URLSearchParams({
    provider: c.provider,
    userEmail: c.userEmail,
    countryCode: c.countryCode,
    fiatCurrency: c.fiatCurrency,
  });
  if (c.cryptoAmount != null && Number.isFinite(c.cryptoAmount))
    p.set("cryptoAmount", String(c.cryptoAmount));
  return p.toString();
}

/** Read the current KYC state for a corridor. Throws with a message on failure. */
export async function fetchKycState(c: KycCorridor): Promise<KycState> {
  const res = await fetch(`/api/chainrails/ramp/kyc?${corridorQuery(c)}`, {
    cache: "no-store",
  });
  const data = await res.json().catch(() => null);
  if (!res.ok)
    throw new Error(data?.error || "Couldn't check verification status.");
  return (data ?? {}) as KycState;
}

/** Submit collected field values; returns the updated state. */
export async function submitKyc(
  c: KycCorridor,
  fields: Record<string, string>
): Promise<KycState> {
  const res = await fetch("/api/chainrails/ramp/kyc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...c, fields }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok)
    throw new Error(data?.error || "Couldn't submit your verification details.");
  return (data ?? {}) as KycState;
}

/* ── On-device cache of submitted values, keyed by email ──────────────────────
 * "Provided" fields (phone, address, country, name) don't change often, so we
 * remember what the user typed and pre-fill it next time — the profile lives on
 * Chainrails, this is just so a returning user isn't retyping. Sensitive values
 * (assurance "verified", e.g. BVN/DOB) are never cached.
 */
const CACHE_PREFIX = "railglide:ramp:kyc:";

function cacheKey(email: string): string {
  return CACHE_PREFIX + email.trim().toLowerCase();
}

export function loadKycFields(email: string): Record<string, string> {
  if (!email.trim()) return {};
  try {
    const raw = localStorage.getItem(cacheKey(email));
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Persist non-sensitive field values so a returning user doesn't retype them. */
export function saveKycFields(
  email: string,
  fields: Record<string, string>,
  requirements: KycRequirement[]
): void {
  if (!email.trim()) return;
  const sensitiveKeys = new Set(
    requirements
      .filter((r) => r.sensitive || r.assurance === "verified")
      .map((r) => r.key)
  );
  const safe: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (!sensitiveKeys.has(k) && v.trim()) safe[k] = v.trim();
  }
  try {
    const merged = { ...loadKycFields(email), ...safe };
    localStorage.setItem(cacheKey(email), JSON.stringify(merged));
  } catch {
    // localStorage unavailable — values just won't persist this session.
  }
}
