"use client";

/**
 * BuyFlow — guided fiat on-ramp (local currency → stablecoin).
 *
 * How much, in which currency. The stablecoin lands as USDC on the
 * settlement chain by default. Produces the same Quote the NL path does and
 * hands off to the shared ReviewScreen (which collects the fiat refund
 * account and shows the deposit instructions through execution).
 */

import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { DEFAULT_SETTLEMENT_CHAIN_ID, getChain } from "@/config/network";
import { PAYCREST_FIAT } from "@/rails/paycrest";
import { fiatOptionLabel, formatAmountInput, formatToken } from "@/utils";
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
import { useSwapFlowNav } from "../useSwapFlowNav";

/** Fetch the live on-ramp rate and return the lines to overwrite on a quote. */
async function fetchBuyRate(amount: string, currency: string) {
  try {
    const res = await fetch(
      `/api/paycrest/rate?fiat=${encodeURIComponent(currency)}&token=USDC`
    );
    const data = await res.json();
    if (res.ok && data?.rate) {
      const usdc = Number(amount) / Number(data.rate);
      return {
        amount: `≈ ${formatToken(usdc, "USDC", 2)}`,
        rate: `${data.rate} ${currency}/USDC`,
      };
    }
  } catch {
    // Rate is a nicety — fall back to the placeholder estimate.
  }
  return null;
}

export function BuyFlow({
  onSubmit,
  onBack,
}: {
  onSubmit: (intent: Intent) => void;
  onBack: () => void;
}) {
  const { step, setStep, patchUrl } = useSwapFlowNav();
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<string>("NGN");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [payoutDraft, setPayoutDraft] = useState<PayoutDetails | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(step !== "review");

  const destChain = DEFAULT_SETTLEMENT_CHAIN_ID;
  const destName = getChain(destChain)?.name ?? destChain;
  const canContinue = Number(amount) > 0;
  const label = `Buy USDC with ${amount} ${currency}`;

  // Restore review step after refresh (?flow=buy&step=review).
  useEffect(() => {
    if (step !== "review") {
      setReady(true);
      return;
    }
    const draft = loadFlowDraft();
    if (draft?.flow === "buy") {
      setAmount(draft.amount);
      setCurrency(draft.currency);
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

  useEffect(() => {
    const launch = loadPendingLaunch();
    if (!launch || launch.flow !== "buy") return;
    if (launch.amount) setAmount(launch.amount);
    if (launch.currency) setCurrency(launch.currency);
    clearPendingLaunch();
  }, []);

  const refreshRate = async (draft: FlowDraft) => {
    const rate = await fetchBuyRate(draft.amount, draft.currency);
    if (!rate) return;
    const next: Quote = {
      ...draft.quote,
      to: { ...draft.quote.to, amount: rate.amount },
      rate: rate.rate,
    };
    setQuote(next);
    storeFlowDraft({ ...draft, quote: next });
    toast.success("Rate updated");
  };

  const buildDraft = (q: Quote, payout?: PayoutDetails): FlowDraft => ({
    flow: "buy",
    amount,
    currency,
    quote: q,
    label,
    payout,
  });

  const persistDraft = (q: Quote, payout?: PayoutDetails) => {
    storeFlowDraft(buildDraft(q, payout));
    setStep("review");
  };

  const toReview = async () => {
    setLoading(true);
    setError(null);
    const intent: IntentResponse = {
      action: "onramp",
      fromChain: null,
      fromToken: currency,
      fromAmount: amount,
      toChain: destChain,
      toToken: "USDC",
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

    const rate = await fetchBuyRate(amount, currency);
    if (rate) {
      r.to.amount = rate.amount;
      r.rate = rate.rate;
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
        onConfirm={(payout) => {
          clearFlowDraft();
          patchUrl({ step: null });
          onSubmit({
            text: label,
            quote: payout
              ? { ...quote, exec: { ...quote.exec, payout } }
              : quote,
          });
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
          Buy crypto
        </h1>
        <span className="muted" style={{ fontSize: 14 }}>
          Pay with local currency, receive USDC in your wallet.
        </span>
      </header>

      <div className="card col gap-5" style={{ padding: 20 }}>
        <label className="col gap-2">
          <span
            className="font-mono"
            style={{ fontSize: 10, letterSpacing: 0.06, color: "var(--fg-mute)", textTransform: "uppercase" }}
          >
            You pay
          </span>
          <input
            value={formatAmountInput(amount)}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9.]/g, "");
              if ((v.match(/\./g) || []).length > 1) return;
              setAmount(v);
            }}
            inputMode="decimal"
            placeholder="0"
            style={{ ...INPUT, fontSize: 22, fontWeight: 500 }}
          />
        </label>

        <label className="col gap-2">
          <span
            className="font-mono"
            style={{ fontSize: 10, letterSpacing: 0.06, color: "var(--fg-mute)", textTransform: "uppercase" }}
          >
            Paying with
          </span>
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
          <span className="muted" style={{ fontSize: 12 }}>
            You receive USDC on {destName}
          </span>
        </label>

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
