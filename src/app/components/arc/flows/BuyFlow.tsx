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
import { getChain, type ChainId } from "@/config/network";
import { PAYCREST_CHAIN_IDS, PAYCREST_FIAT } from "@/rails/paycrest";
import { usePaycrestNetwork } from "@/hooks/usePaycrestNetwork";
import { usePaycrestRate } from "@/hooks";
import { fetchPaycrestRate } from "@/lib/paycrestRate";
import { fiatOptionLabel, formatNumber, formatToken, fiatSymbol } from "@/utils";
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
import { useSwapFlowNav } from "../useSwapFlowNav";

const TOKENS = ["USDC", "USDT"] as const;

/** Quote lines (crypto received + rate) derived from a unit rate. */
function rateLines(
  amount: string,
  currency: string,
  token: string,
  unitRate: number
) {
  const received = (Number(amount) || 0) / unitRate;
  return {
    amount: `≈ ${formatToken(received, token, 2)}`,
    rate: `${formatNumber(unitRate)} ${currency}/${token}`,
  };
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
  const [token, setToken] = useState<(typeof TOKENS)[number]>("USDC");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [payoutDraft, setPayoutDraft] = useState<PayoutDetails | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(step !== "review");

  // Receiving USDC needs no wallet switch — it lands at your address on any
  // supported chain. So the destination is an explicit choice, pre-selected to
  // the chain you're already on (when supported) and overridable below.
  const { chain: smartDefault } = usePaycrestNetwork();
  const [network, setNetwork] = useState<ChainId>(smartDefault);
  const [networkTouched, setNetworkTouched] = useState(false);
  const [showNetworkInfo, setShowNetworkInfo] = useState(false);
  useEffect(() => {
    if (!networkTouched) setNetwork(smartDefault);
  }, [smartDefault, networkTouched]);
  // Live unit rate, fetched once per (currency, token) pair — we divide the
  // typed fiat by it locally so the crypto estimate updates with no extra API
  // calls. The exact rate locks when the order is created.
  const { rate: unitRate } = usePaycrestRate(currency, token);
  const amountNum = Number(amount) || 0;
  const estimate = unitRate && amountNum > 0 ? amountNum / unitRate : null;

  const canContinue = Number(amount) > 0;
  const label = `Buy ${token} with ${amount} ${currency}`;

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

  useEffect(() => {
    const launch = loadPendingLaunch();
    if (!launch || launch.flow !== "buy") return;
    if (launch.amount) setAmount(launch.amount);
    if (launch.currency) setCurrency(launch.currency);
    if (launch.token === "USDC" || launch.token === "USDT") {
      setToken(launch.token);
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
    flow: "buy",
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
      action: "onramp",
      fromChain: null,
      fromToken: currency,
      fromAmount: amount,
      toChain: network,
      toToken: token,
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
        onConfirm={(payout, destination) => {
          clearFlowDraft();
          patchUrl({ step: null });
          const exec = {
            ...quote.exec,
            ...(payout ? { payout } : {}),
            ...(destination ? { recipient: destination } : {}),
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
          Buy crypto
        </h1>
        <span className="muted" style={{ fontSize: 14 }}>
          Pay with local currency, receive USDC or USDT in your wallet.
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
          <PrefixedAmountInput
            amount={amount}
            onAmountChange={setAmount}
            prefix={fiatSymbol(currency)}
          />
          {unitRate && (
            <div
              className="row center gap-2"
              style={{ fontSize: 12.5, padding: "0 2px" }}
            >
              {estimate !== null && (
                <span style={{ color: "var(--accent)", fontWeight: 500 }}>
                  You receive ≈ {formatToken(estimate, token, 2)}
                </span>
              )}
              <span className="muted font-mono tabular">
                {estimate !== null
                  ? `(1 ${token} = ${formatNumber(unitRate)} ${currency})`
                  : `1 ${token} = ${formatNumber(unitRate)} ${currency}`}
              </span>
            </div>
          )}
          {unitRate && estimate !== null && (
            <span
              className="muted"
              style={{ fontSize: 11, padding: "0 2px", opacity: 0.85 }}
            >
              Estimate · final rate locks when you create the order
            </span>
          )}
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
        </label>

        <label className="col gap-2">
          <span
            className="row center"
            style={{ gap: 6, fontSize: 10, letterSpacing: 0.06, color: "var(--fg-mute)", textTransform: "uppercase" }}
          >
            <span className="font-mono">Receive</span>
            <span
              style={{ position: "relative", display: "inline-flex" }}
              onMouseEnter={() => setShowNetworkInfo(true)}
              onMouseLeave={() => setShowNetworkInfo(false)}
            >
              <button
                type="button"
                aria-label="About the receive network"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowNetworkInfo((v) => !v);
                }}
                style={{
                  cursor: "pointer",
                  width: 14,
                  height: 14,
                  borderRadius: 999,
                  border: "1px solid var(--line-2)",
                  background: showNetworkInfo ? "var(--line-2)" : "transparent",
                  color: "var(--fg-mute)",
                  fontSize: 9,
                  fontWeight: 700,
                  fontStyle: "italic",
                  fontFamily: "Georgia, serif",
                  textTransform: "none",
                  lineHeight: 1,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                i
              </button>
              {showNetworkInfo && (
                <span
                  role="tooltip"
                  style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    left: -4,
                    zIndex: 30,
                    width: 232,
                    padding: "10px 12px",
                    background: "var(--bg-elev)",
                    border: "1px solid var(--line-2)",
                    borderRadius: 10,
                    boxShadow: "0 10px 28px rgba(0,0,0,0.22)",
                    color: "var(--fg-soft)",
                    fontSize: 11.5,
                    fontWeight: 400,
                    fontStyle: "normal",
                    lineHeight: 1.5,
                    letterSpacing: 0,
                    textTransform: "none",
                    whiteSpace: "normal",
                  }}
                >
                  The chain your stablecoin lands on. Base, Arbitrum &amp;
                  Polygon have near-zero transaction fees — Ethereum is far
                  pricier to use afterward.
                </span>
              )}
            </span>
          </span>
          <div className="row center gap-2">
            <select
              value={network}
              onChange={(e) => {
                setNetworkTouched(true);
                setNetwork(e.target.value as ChainId);
              }}
              style={{ ...INPUT, cursor: "pointer", flex: 1 }}
            >
              {PAYCREST_CHAIN_IDS.map((id) => (
                <option key={id} value={id}>
                  {getChain(id)?.name ?? id}
                </option>
              ))}
            </select>
            <div className="row center gap-1" style={{ flex: "0 0 auto" }}>
              {TOKENS.map((t) => (
                <button
                  key={t}
                  type="button"
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
