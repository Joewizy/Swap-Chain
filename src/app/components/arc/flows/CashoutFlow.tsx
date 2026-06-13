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
import { fiatOptionLabel, formatFiat } from "@/utils";
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

/** Fetch the live off-ramp rate and return the lines to overwrite on a quote. */
async function fetchCashoutRate(amount: string, currency: string, token: string) {
  try {
    const res = await fetch(
      `/api/paycrest/rate?fiat=${encodeURIComponent(currency)}&token=${token}`
    );
    const data = await res.json();
    if (res.ok && data?.rate) {
      return {
        amount: `≈ ${formatFiat(currency, Number(amount) * Number(data.rate))}`,
        rate: `${data.rate} ${currency}/${token}`,
      };
    }
  } catch {
    // Rate is a nicety — the exact figure comes from the order invoice.
  }
  return null;
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
    const rate = await fetchCashoutRate(
      draft.amount,
      draft.currency,
      draft.token ?? "USDC"
    );
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
    setStep("review");
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

    const rate = await fetchCashoutRate(amount, currency, token);
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
                  className="chip"
                  style={{
                    cursor: "pointer",
                    padding: "8px 12px",
                    fontSize: 13,
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
