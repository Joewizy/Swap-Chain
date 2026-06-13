"use client";

/**
 * CashoutFlow — guided fiat off-ramp (stablecoin → bank / mobile money).
 *
 * The plain-language version of an off-ramp: how much, paid out in which
 * currency. No tokens-vs-chains mental model up front — the source defaults
 * to the settlement chain. Produces the same Quote the NL path does and
 * hands off to the shared ReviewScreen (which collects the bank / mobile
 * money details and runs the connect → confirm → execute flow).
 */

import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { getChain, resolveChain, type ChainId } from "@/config/network";
import {
  PAYCREST_CHAIN_IDS,
  PAYCREST_FIAT,
  paycrestNetworkSlug,
} from "@/rails/paycrest";
import { usePaycrestNetwork } from "@/hooks/usePaycrestNetwork";
import { usePaycrestRate, useTokenBalance } from "@/hooks";
import { fetchPaycrestRate } from "@/lib/paycrestRate";
import { fiatOptionLabel, formatFiat, formatNumber, formatToken } from "@/utils";
import { PrefixedAmountInput } from "./PrefixedAmountInput";
import {
  ReviewScreen,
  quoteFromIntent,
  type Intent,
  type IntentResponse,
  type PayoutDetails,
  type Quote,
} from "../SendScreen";
import { Icon } from "../icons";
import {
  clearFlowDraft,
  clearPendingLaunch,
  isDraftStale,
  loadFlowDraft,
  loadPendingLaunch,
  storeFlowDraft,
  type FlowDraft,
} from "../swapUrl";
import {
  clearPendingRecipient,
  loadPendingRecipient,
  recipientToPayout,
} from "../recipients";
import { useSwapFlowNav } from "../useSwapFlowNav";

const TOKENS = ["USDC", "USDT"] as const;

/** Quote lines (recipient amount + rate) derived from a unit rate. */
function rateLines(
  amount: string,
  currency: string,
  token: string,
  unitRate: number
) {
  return {
    amount: `≈ ${formatFiat(currency, (Number(amount) || 0) * unitRate)}`,
    rate: `${formatNumber(unitRate)} ${currency}/${token}`,
  };
}

export function CashoutFlow({
  onSubmit,
  onBack,
}: {
  onSubmit: (intent: Intent) => void;
  onBack: () => void;
}) {
  const { step, setStep, patchUrl } = useSwapFlowNav();
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState<(typeof TOKENS)[number]>("USDC");
  const [currency, setCurrency] = useState<string>("NGN");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [payoutDraft, setPayoutDraft] = useState<PayoutDetails | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(step !== "review");
  // A chain the user named in chat ("on Polygon"), once resolved + supported.
  const [seedChain, setSeedChain] = useState<ChainId | undefined>();

  // Source chain: where the user's USDC is. An explicit pick (like Buy),
  // pre-selected to a chain named in chat, else the connected wallet's chain
  // when supported, else the default — and overridable. No wallet needed.
  const { chain: defaultSource } = usePaycrestNetwork(seedChain);
  const [sourceChain, setSourceChain] = useState<ChainId>(defaultSource);
  const [sourceTouched, setSourceTouched] = useState(false);
  useEffect(() => {
    if (!sourceTouched) setSourceChain(defaultSource);
  }, [defaultSource, sourceTouched]);
  // Connected wallet's balance of the selected token on the chosen chain, so
  // the user can see what they have before getting a quote. Undefined until a
  // wallet is connected and the read resolves.
  const balance = useTokenBalance(token, sourceChain);

  // Live unit rate, fetched once per (currency, token) pair — we multiply it
  // locally as the user types so the Naira estimate updates with no extra API
  // calls. The exact rate locks when the order is created.
  const { rate: unitRate } = usePaycrestRate(currency, token);

  const amountNum = Number(amount) || 0;
  const estimate = unitRate && amountNum > 0 ? amountNum * unitRate : null;

  // Balance is informational, not a gate: orders can be funded from any wallet,
  // so an amount above the connected balance still proceeds (with a heads-up).
  // Floor to 2dp so the shown balance and the Max fill match exactly.
  const balanceNum =
    balance.formatted !== undefined ? Number(balance.formatted) : undefined;
  const balanceFloored =
    balanceNum !== undefined ? Math.floor(balanceNum * 100) / 100 : undefined;
  const overBalance = balanceNum !== undefined && amountNum > balanceNum;

  const canContinue = Number(amount) > 0;
  const label = `Cash out ${amount} ${token} to ${currency}`;

  useEffect(() => {
    if (step !== "review") {
      setReady(true);
      return;
    }
    const draft = loadFlowDraft();
    if (draft?.flow === "cashout") {
      setAmount(draft.amount);
      setCurrency(draft.currency);
      if (draft.token === "USDC" || draft.token === "USDT") {
        setToken(draft.token);
      }
      setQuote(draft.quote);
      setPayoutDraft(draft.payout);
      setReady(true);
      // A persisted quote is a cache — refresh the rate line if it's gone stale.
      if (isDraftStale(draft)) void refreshRate(draft);
      return;
    }
    setStep("compose");
    setReady(true);
  }, [step, setStep]);

  // Prefill from a recipient picked on the Recipients screen ("Send").
  useEffect(() => {
    const pending = loadPendingRecipient();
    if (!pending) return;
    setCurrency(pending.currency);
    setPayoutDraft(recipientToPayout(pending));
    clearPendingRecipient();
  }, []);

  // Seed fields from chat → cashout launch payload.
  useEffect(() => {
    const launch = loadPendingLaunch();
    if (!launch || launch.flow !== "cashout") return;
    if (launch.amount) setAmount(launch.amount);
    if (launch.currency) setCurrency(launch.currency);
    if (launch.token === "USDC" || launch.token === "USDT") {
      setToken(launch.token);
    }
    if (launch.chain) {
      const resolved = resolveChain(launch.chain);
      if (resolved && paycrestNetworkSlug(resolved)) setSeedChain(resolved);
    }
    if (launch.institution || launch.institutionName) {
      setPayoutDraft((prev) => ({
        institution: launch.institution ?? prev?.institution ?? "",
        institutionName: launch.institutionName ?? prev?.institutionName ?? "",
        accountIdentifier: prev?.accountIdentifier ?? "",
        accountName: prev?.accountName ?? "",
      }));
    }
    clearPendingLaunch();
  }, []);

  const refreshRate = async (draft: FlowDraft) => {
    const draftToken = draft.token ?? "USDC";
    const ur = await fetchPaycrestRate(draft.currency, draftToken);
    if (!ur) return;
    const lines = rateLines(draft.amount, draft.currency, draftToken, ur);
    const next: Quote = {
      ...draft.quote,
      to: { ...draft.quote.to, amount: lines.amount },
      rate: lines.rate,
    };
    setQuote(next);
    storeFlowDraft({ ...draft, quote: next });
    toast.success("Rate updated");
  };

  const buildDraft = (q: Quote, payout?: PayoutDetails): FlowDraft => ({
    flow: "cashout",
    amount,
    currency,
    token,
    quote: q,
    label,
    payout,
  });

  const persistDraft = (q: Quote, payout?: PayoutDetails) => {
    storeFlowDraft(buildDraft(q, payout));
    // Push so the back button returns to the form, not out of the app.
    setStep("review", { push: true });
  };

  const toReview = async () => {
    setLoading(true);
    setError(null);
    const intent: IntentResponse = {
      action: "offramp",
      fromChain: sourceChain,
      fromToken: token,
      fromAmount: amount,
      toChain: null,
      toToken: null,
      fiatCurrency: currency,
      recipient: null,
      needsClarification: false,
      clarificationQuestion: null,
      confidence: 1,
    };
    const r = await quoteFromIntent(intent);
    if (!r) {
      setLoading(false);
      return setError("Couldn't build a quote — try again.");
    }
    if ("error" in r) {
      setLoading(false);
      return setError(r.reason);
    }

    // Reuse the cached live rate; only hit the API if it hasn't loaded yet.
    const ur = unitRate ?? (await fetchPaycrestRate(currency, token));
    if (ur) {
      const lines = rateLines(amount, currency, token, ur);
      r.to.amount = lines.amount;
      r.rate = lines.rate;
    }

    setLoading(false);
    setQuote(r);
    persistDraft(r, payoutDraft);
  };

  const leaveReview = () => {
    clearFlowDraft();
    patchUrl({ step: null });
    setQuote(null);
    setPayoutDraft(undefined);
  };

  const handleBack = () => {
    clearFlowDraft();
    patchUrl({ step: null });
    onBack();
  };

  if (!ready) return null;

  if (quote) {
    return (
      <ReviewScreen
        quote={quote}
        text={label}
        initialPayout={payoutDraft}
        onPayoutChange={(p) => {
          setPayoutDraft(p);
          storeFlowDraft(buildDraft(quote, p));
        }}
        onBack={leaveReview}
        onConfirm={(payout, refundAddress) => {
          clearFlowDraft();
          patchUrl({ step: null });
          const exec = {
            ...quote.exec,
            ...(payout ? { payout } : {}),
            ...(refundAddress ? { refundAddress } : {}),
          };
          onSubmit({ text: label, quote: { ...quote, exec } });
        }}
      />
    );
  }

  return (
    <div className="col gap-6">
      <header className="col gap-1">
        <button
          className="btn btn-quiet btn-sm"
          onClick={handleBack}
          style={{ padding: "0 8px", alignSelf: "flex-start", marginBottom: 4 }}
        >
          <Icon.Arrow rotate={180} size={12} /> Back
        </button>
        <h1 style={{ fontSize: 28, lineHeight: 1.1, letterSpacing: "-0.02em", fontWeight: 500 }}>
          Cash out
        </h1>
        <span className="muted" style={{ fontSize: 14 }}>
          Send stablecoins to a bank or mobile money account.
        </span>
      </header>

      <div className="card col gap-5" style={{ padding: 20 }}>
        <Field label="Amount">
          <div className="col gap-2">
            <div className="row center gap-2">
              <PrefixedAmountInput
                amount={amount}
                onAmountChange={setAmount}
                prefix="$"
              />
              <div className="row center gap-1" style={{ flex: "0 0 auto" }}>
                {TOKENS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setToken(t)}
                    style={{
                      cursor: "pointer",
                      padding: "8px 14px",
                      fontSize: 13,
                      fontWeight: 500,
                      lineHeight: 1.2,
                      borderRadius: 999,
                      border: "1px solid",
                      background: token === t ? "var(--btn-bg)" : "var(--bg-elev)",
                      color: token === t ? "var(--btn-fg)" : "var(--fg-soft)",
                      borderColor: token === t ? "var(--btn-bg)" : "var(--line-2)",
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Balance first — what they have, with Max right beside it. */}
            {balanceFloored !== undefined && (
              <div
                className="row between center gap-2"
                style={{ fontSize: 12.5, padding: "0 2px" }}
              >
                <span className="muted">
                  Balance on {getChain(sourceChain)?.name ?? sourceChain} ·{" "}
                  <span className="font-mono tabular">
                    {formatToken(balanceFloored, token, 2)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setAmount(String(balanceFloored))}
                  style={{
                    padding: "3px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    background: "var(--bg-elev)",
                    border: "1px solid var(--line-2)",
                    borderRadius: 999,
                    color: "var(--accent)",
                    cursor: "pointer",
                  }}
                >
                  Max
                </button>
              </div>
            )}

            {/* One line: estimate + the rate that produced it, in parens. */}
            {unitRate && (
              <div
                className="row center gap-2"
                style={{ fontSize: 12.5, padding: "0 2px" }}
              >
                {estimate !== null && (
                  <span style={{ color: "var(--accent)", fontWeight: 500 }}>
                    ≈ {formatFiat(currency, estimate)}
                  </span>
                )}
                <span className="muted font-mono tabular">
                  {estimate !== null
                    ? `(1 ${token} = ${formatNumber(unitRate)} ${currency})`
                    : `1 ${token} = ${formatNumber(unitRate)} ${currency}`}
                </span>
              </div>
            )}

            {overBalance && (
              <span
                style={{
                  fontSize: 12,
                  color: "var(--pend)",
                  padding: "0 2px",
                  lineHeight: 1.4,
                }}
              >
                That&apos;s more than this wallet holds — you can still continue
                and send from another wallet, or top up first.
              </span>
            )}
          </div>
        </Field>

        <label className="col gap-2">
          <span
            className="font-mono"
            style={{ fontSize: 10, letterSpacing: 0.06, color: "var(--fg-mute)" }}
          >
            <span style={{ textTransform: "uppercase" }}>From</span>
            {" "}(The chain your USDC/USDT is on.)
          </span>
          <select
            value={sourceChain}
            onChange={(e) => {
              setSourceTouched(true);
              setSourceChain(e.target.value as ChainId);
            }}
            style={{ ...INPUT, cursor: "pointer" }}
          >
            {PAYCREST_CHAIN_IDS.map((id) => (
              <option key={id} value={id}>
                {getChain(id)?.name ?? id}
              </option>
            ))}
          </select>
        </label>

        <Field label="Recipient gets paid in">
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            style={{ ...INPUT, cursor: "pointer" }}
          >
            {PAYCREST_FIAT.map((c) => (
              <option key={c} value={c}>
                {fiatOptionLabel(c)}
              </option>
            ))}
          </select>
        </Field>

        {error && (
          <div
            style={{
              padding: "12px 14px",
              background: "var(--err-soft)",
              border: "1px solid var(--err)",
              borderRadius: 10,
              fontSize: 13,
              color: "var(--fg-soft)",
            }}
          >
            {error}
          </div>
        )}

        <button
          className="btn btn-fat"
          disabled={!canContinue || loading}
          onClick={toReview}
          style={{
            background: canContinue ? "var(--btn-bg)" : "var(--bg-sunk)",
            color: canContinue ? "var(--btn-fg)" : "var(--fg-faint)",
            cursor: canContinue && !loading ? "pointer" : "default",
          }}
        >
          {loading ? (
            <>
              <Icon.Spinner size={14} /> Getting quote…
            </>
          ) : (
            <>
              Continue <Icon.ArrowRight />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="col gap-2">
      <span
        className="font-mono"
        style={{
          fontSize: 10,
          letterSpacing: 0.06,
          color: "var(--fg-mute)",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
