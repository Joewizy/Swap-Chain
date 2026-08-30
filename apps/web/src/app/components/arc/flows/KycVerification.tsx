"use client";

/**
 * Chainrails headless-KYC step. Renders a form from the provider's live
 * `missingRequirements` (never hardcoded — a bigger amount or a different
 * provider can ask for more), submits the values, then polls until the profile
 * `canProceed`. The parent (the Sell flow) shows this before creating an order
 * and retries the order once `onCleared` fires.
 *
 * We don't choose the fields, but we do order and shape them so a one-time
 * check reads like a quick confirmation, not a long form: the fast, familiar
 * fields come first (phone, name, country), the heavier address sits last, a
 * first/last name pair shares a row, and country is a dropdown prefilled from
 * the corridor we're already paying into.
 *
 * "provided" fields (phone, address, country, name) usually clear on submit.
 * "verified" fields or an `external_verification` capability need a hosted flow
 * we can't inline — for those we surface the link and poll for the result.
 */

import React, { useEffect, useMemo, useState } from "react";
import { toE164 } from "@/rails/chainrails";
import { Icon } from "../icons";
import { InfoHint } from "../SendScreen";
import {
  type KycCorridor,
  type KycRequirement,
  type KycState,
  fetchKycState,
  submitKyc,
  outstandingRequirements,
  needsExternalVerification,
  loadKycFields,
  saveKycFields,
} from "../rampKyc";

const INPUT: React.CSSProperties = {
  width: "100%",
  padding: "11px 12px",
  background: "var(--bg-soft)",
  border: "1px solid var(--line)",
  borderRadius: 10,
  color: "var(--fg)",
  fontSize: 14,
  outline: "none",
};

/** A short list of the countries these corridors serve, so the country field is
 *  a friendly dropdown instead of a free-text box. Value is the readable name
 *  (matching the old "Country of residence" text field); unknown codes fall
 *  back to the code itself so we never show an empty picker. */
const COUNTRIES: { code: string; name: string }[] = [
  { code: "NG", name: "Nigeria" },
  { code: "GH", name: "Ghana" },
  { code: "KE", name: "Kenya" },
  { code: "ZA", name: "South Africa" },
  { code: "UG", name: "Uganda" },
  { code: "TZ", name: "Tanzania" },
  { code: "RW", name: "Rwanda" },
  { code: "CM", name: "Cameroon" },
  { code: "CI", name: "Côte d'Ivoire" },
  { code: "SN", name: "Senegal" },
  { code: "BJ", name: "Benin" },
  { code: "TG", name: "Togo" },
  { code: "ZM", name: "Zambia" },
];

function countryName(code: string): string {
  return COUNTRIES.find((c) => c.code === code.toUpperCase())?.name || code;
}

function isPhoneKey(key: string): boolean {
  return key.toLowerCase().includes("phone");
}

function isCountryKey(key: string): boolean {
  return key.toLowerCase().includes("country");
}

/** Where a requirement sits in the form. Lower = higher up. Phone and name are
 *  quick and familiar, so they lead; the free-text address is the heaviest, so
 *  it sits last. Anything we don't recognise keeps a middle spot. */
function fieldRank(key: string): number {
  const k = key.toLowerCase();
  if (isPhoneKey(k)) return 0;
  if (k.includes("first") && k.includes("name")) return 1;
  if (k.includes("last") && k.includes("name")) return 2;
  if (k.includes("name")) return 3;
  if (isCountryKey(k)) return 4;
  if (k.includes("address")) return 9; // heaviest — always last
  return 6;
}

/** Best-effort input hints from the requirement key, so mobile shows the right
 *  keyboard and the placeholder reads naturally. Purely cosmetic — the value is
 *  still whatever the user types. */
function inputHints(key: string): {
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  type?: string;
  placeholder?: string;
} {
  const k = key.toLowerCase();
  if (isPhoneKey(k))
    return { inputMode: "tel", placeholder: "0803 123 4567" };
  if (k.includes("email"))
    return { inputMode: "email", type: "email", placeholder: "you@example.com" };
  if (k.includes("date") || k.includes("dob") || k.includes("birth"))
    return { type: "date" };
  if (k === "bvn" || k.includes("bvn") || k.includes("nin"))
    return { inputMode: "numeric", placeholder: "Number" };
  if (k.includes("address"))
    return { placeholder: "Street, city, state" };
  return {};
}

/** A gentle, non-blocking nudge under a phone field only when the number looks
 *  too short to be real. No chatter about formatting — the value is normalised
 *  to E.164 on submit, which the user never needs to think about. */
function phoneHint(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits && digits.length < 7) return "Enter the full phone number.";
  return null;
}

/** Warmer, conversational labels for the fields users see most. Falls back to
 *  the provider's own label for anything we don't specially name. */
function prettyLabel(key: string, fallback: string): string {
  const k = key.toLowerCase();
  if (isPhoneKey(k)) return "Mobile number";
  if (k.includes("first") && k.includes("name")) return "Your first name";
  if (k.includes("last") && k.includes("name")) return "Your last name";
  if (isCountryKey(k)) return "Country";
  if (k.includes("address")) return "Home address";
  return fallback;
}

/** A phone requirement must go out in E.164 (+234…); everything else as typed. */
function normalizeValue(key: string, value: string, countryCode: string): string {
  const v = value.trim();
  if (isPhoneKey(key)) return toE164(v, countryCode);
  return v;
}

/** Group a first-name + last-name pair into one row so "Last name" never stands
 *  alone looking half-finished. Everything else is its own row. */
function toRows(reqs: KycRequirement[]): KycRequirement[][] {
  const isFirst = (r: KycRequirement) =>
    r.key.toLowerCase().includes("first") && r.key.toLowerCase().includes("name");
  const isLast = (r: KycRequirement) =>
    r.key.toLowerCase().includes("last") && r.key.toLowerCase().includes("name");
  const first = reqs.find(isFirst);
  const last = reqs.find(isLast);
  const rows: KycRequirement[][] = [];
  const paired = new Set<string>();
  if (first && last) {
    paired.add(first.key);
    paired.add(last.key);
  }
  for (const r of reqs) {
    if (paired.has(r.key)) {
      if (r.key === first!.key) rows.push([first!, last!]);
      continue; // the last-name half is emitted with the first
    }
    rows.push([r]);
  }
  return rows;
}

export function KycVerification({
  corridor,
  initialState,
  onCleared,
  onCancel,
}: {
  corridor: KycCorridor;
  /** State the caller already read (e.g. the order's KYC_REQUIRED body), so we
   *  can render the form immediately without a first round-trip. */
  initialState?: KycState;
  /** The profile can proceed — the caller should (re)create the order. */
  onCleared: () => void;
  onCancel?: () => void;
}) {
  const [state, setState] = useState<KycState | null>(initialState ?? null);
  const [loading, setLoading] = useState(!initialState);
  const [values, setValues] = useState<Record<string, string>>(() =>
    loadKycFields(corridor.userEmail)
  );
  const [submitting, setSubmitting] = useState(false);
  const [polling, setPolling] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // No pre-read state — fetch it once so we know what's outstanding.
  useEffect(() => {
    if (initialState) return;
    let cancelled = false;
    setLoading(true);
    fetchKycState(corridor)
      .then((s) => !cancelled && setState(s))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The moment a fetched/submitted state clears, show a brief "Verified" beat so
  // the step lands as a confirmation, then hand back to the parent to proceed.
  useEffect(() => {
    if (!state?.canProceed) return;
    setCleared(true);
    const t = setTimeout(onCleared, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.canProceed]);

  const requirements = useMemo(
    () => (state ? outstandingRequirements(state) : []),
    [state]
  );
  // Quick, familiar fields first; the address last (see fieldRank).
  const ordered = useMemo(() => {
    const list = [...requirements];
    list.sort((a, b) => fieldRank(a.key) - fieldRank(b.key));
    return list;
  }, [requirements]);
  const rows = useMemo(() => toRows(ordered), [ordered]);

  // We already know the payout country from the corridor — prefill it so the
  // user confirms rather than types (they can still change residence).
  useEffect(() => {
    const countryReq = requirements.find((r) => isCountryKey(r.key));
    if (!countryReq) return;
    setValues((v) =>
      v[countryReq.key]?.trim()
        ? v
        : { ...v, [countryReq.key]: countryName(corridor.countryCode) }
    );
  }, [requirements, corridor.countryCode]);

  const external = state ? needsExternalVerification(state) : false;
  const blocked = state?.blocked === true;

  const complete = requirements.every(
    (r) => (values[r.key]?.trim().length ?? 0) > 0
  );

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const fields: Record<string, string> = {};
      for (const r of requirements) {
        fields[r.key] = normalizeValue(
          r.key,
          values[r.key] ?? "",
          corridor.countryCode
        );
      }
      const next = await submitKyc(corridor, fields);
      saveKycFields(corridor.userEmail, values, requirements);
      setState(next);
      // Values accepted but still settling (verified/external) — poll a while.
      if (!next.canProceed && !next.blocked) await pollUntilResolved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't submit verification.");
    } finally {
      setSubmitting(false);
    }
  };

  // Poll the state for pending/external verification, backing off politely and
  // giving up after ~30s so we never spin forever.
  const pollUntilResolved = async () => {
    setPolling(true);
    try {
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const s = await fetchKycState(corridor).catch(() => null);
        if (!s) continue;
        setState(s);
        if (s.canProceed || s.blocked) return;
      }
    } finally {
      setPolling(false);
    }
  };

  if (loading) {
    return (
      <div className="card col center gap-3" style={{ padding: "36px 24px" }}>
        <Icon.Spinner size={18} />
        <span className="muted" style={{ fontSize: 13 }}>
          Checking your verification…
        </span>
      </div>
    );
  }

  // Cleared — a short confirmation beat before the parent creates the order.
  if (cleared) {
    return (
      <div className="card col center gap-3" style={{ padding: "36px 24px" }}>
        <span
          style={{
            width: 46,
            height: 46,
            borderRadius: "50%",
            background: "var(--ok-soft)",
            color: "var(--ok)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon.Check size={22} />
        </span>
        <span style={{ fontSize: 15, fontWeight: 600 }}>Details verified</span>
        <span className="muted" style={{ fontSize: 13 }}>
          Setting up your payout…
        </span>
      </div>
    );
  }

  if (blocked) {
    return (
      <div className="card col gap-3" style={{ padding: 20 }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>
          We can&apos;t verify this account automatically
        </span>
        <span className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
          Your verification needs a manual review. Please reach out to support so
          we can sort it out — your funds are not affected.
        </span>
        {onCancel && (
          <button className="btn btn-quiet" onClick={onCancel}>
            Back
          </button>
        )}
      </div>
    );
  }

  // Nothing left to collect but a hosted step is required (identity/redirect).
  if (external && requirements.length === 0) {
    return (
      <div className="card col gap-3" style={{ padding: 20 }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>
          One more verification step
        </span>
        <span className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
          This payout needs a quick identity check. Open the secure verification
          page, finish it, then come back — we&apos;ll pick up right here.
        </span>
        {state?.verificationUrl && (
          <a
            className="btn btn-primary"
            href={state.verificationUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open verification <Icon.ArrowRight />
          </a>
        )}
        <button
          className="btn btn-quiet"
          onClick={pollUntilResolved}
          disabled={polling}
        >
          {polling ? (
            <>
              <Icon.Spinner size={14} /> Checking…
            </>
          ) : (
            "I've finished — check again"
          )}
        </button>
      </div>
    );
  }

  // One field per requirement — country as a dropdown, phone with a gentle
  // format hint, a first/last name pair sharing a row (see toRows).
  const renderRow = (row: KycRequirement[]) => (
    <div
      key={row.map((r) => r.key).join("+")}
      className={row.length > 1 ? "row gap-3" : "col"}
    >
      {row.map((r) => {
        const hints = inputHints(r.key);
        const isCountry = isCountryKey(r.key);
        const isPhone = isPhoneKey(r.key);
        const hint = isPhone ? phoneHint(values[r.key] ?? "") : null;
        return (
          <label
            key={r.key}
            className="col gap-1"
            style={row.length > 1 ? { flex: 1, minWidth: 0 } : undefined}
          >
            <span className="muted" style={{ fontSize: 12 }}>
              {prettyLabel(r.key, r.label)}
            </span>
            {isCountry ? (
              <select
                value={values[r.key] ?? countryName(corridor.countryCode)}
                onChange={(e) =>
                  setValues((p) => ({ ...p, [r.key]: e.target.value }))
                }
                style={INPUT}
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={values[r.key] ?? ""}
                onChange={(e) =>
                  setValues((p) => ({ ...p, [r.key]: e.target.value }))
                }
                inputMode={hints.inputMode}
                type={hints.type}
                placeholder={hints.placeholder ?? r.label}
                autoComplete="off"
                style={INPUT}
              />
            )}
            {hint && (
              <span className="muted" style={{ fontSize: 11.5 }}>
                {hint}
              </span>
            )}
          </label>
        );
      })}
    </div>
  );

  return (
    <div className="card col gap-5" style={{ padding: 20 }}>
      <div className="col gap-1">
        <div className="row center gap-1">
          <span className="eyebrow">Verify your details</span>
          <InfoHint text="Cash payouts are regulated — providers confirm who's being paid before releasing funds. We only share what's needed to clear this payout." />
        </div>
        <span className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
          A one-time check so we can send payouts. You won&apos;t be asked again —
          we reuse it for every future sell and buy.
        </span>
      </div>

      <div className="col gap-3">{rows.map(renderRow)}</div>

      {error && (
        <div
          style={{
            padding: "12px 14px",
            background: "var(--err-soft)",
            border: "1px solid var(--err)",
            borderRadius: 10,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      <div className="col gap-3">
        <button
          className="btn btn-fat"
          disabled={!complete || submitting || polling}
          onClick={submit}
          style={{
            background:
              complete && !submitting ? "var(--btn-bg)" : "var(--bg-sunk)",
            color: complete && !submitting ? "var(--btn-fg)" : "var(--fg-faint)",
            cursor: complete && !submitting ? "pointer" : "default",
          }}
        >
          {submitting || polling ? (
            <>
              <Icon.Spinner size={14} /> Verifying…
            </>
          ) : (
            <>
              Confirm &amp; continue <Icon.ArrowRight />
            </>
          )}
        </button>
        <span
          className="row center gap-1 muted"
          style={{ fontSize: 11, justifyContent: "center" }}
        >
          <Icon.Lock size={12} /> We securely verify your details once, then
          reuse them for every payout — no repeated forms.
        </span>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="muted"
            style={{
              alignSelf: "center",
              background: "transparent",
              border: 0,
              padding: 4,
              cursor: "pointer",
              fontSize: 12.5,
              textDecoration: "underline",
            }}
          >
            Back
          </button>
        )}
      </div>
    </div>
  );
}
