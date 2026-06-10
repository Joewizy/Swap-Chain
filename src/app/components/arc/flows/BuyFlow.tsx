"use client";

/**
 * BuyFlow — guided fiat on-ramp (local currency → stablecoin).
 *
 * How much, in which currency. The stablecoin lands as USDC on the
 * settlement chain by default. Produces the same Quote the NL path does and
 * hands off to the shared ReviewScreen (which collects the fiat refund
 * account and shows the deposit instructions through execution).
 */

import React, { useState } from "react";
import { DEFAULT_SETTLEMENT_CHAIN_ID, getChain } from "@/config/network";
import { PAYCREST_FIAT } from "@/rails/paycrest";
import { formatToken } from "@/utils";
import {
  ReviewScreen,
  quoteFromIntent,
  type Intent,
  type IntentResponse,
  type Quote,
} from "../SendScreen";
import { Icon } from "../icons";

export function BuyFlow({
  onSubmit,
  onBack,
}: {
  onSubmit: (intent: Intent) => void;
  onBack: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<string>("NGN");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const destChain = DEFAULT_SETTLEMENT_CHAIN_ID;
  const destName = getChain(destChain)?.name ?? destChain;
  const canContinue = Number(amount) > 0;
  const label = `Buy USDC with ${amount} ${currency}`;

  const toReview = async () => {
    setLoading(true);
    setError(null);
    const intent: IntentResponse = {
      action: "onramp",
      fromChain: null,
      // fromToken = the fiat code marks this as a fiat-denominated buy
      // (the pipeline reads "you pay this much fiat", not "buy this much USDC").
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

    // Estimate the USDC received from the live rate (fiat per 1 USDC).
    try {
      const res = await fetch(
        `/api/paycrest/rate?fiat=${encodeURIComponent(currency)}&token=USDC`
      );
      const data = await res.json();
      if (res.ok && data?.rate) {
        const usdc = Number(amount) / Number(data.rate);
        r.to.amount = `≈ ${formatToken(usdc, "USDC", 2)}`;
        r.rate = `${data.rate} ${currency}/USDC`;
      }
    } catch {
      // Rate is a nicety — fall back to the placeholder estimate.
    }

    setLoading(false);
    setQuote(r);
  };

  if (quote) {
    return (
      <ReviewScreen
        quote={quote}
        text={label}
        onBack={() => setQuote(null)}
        onConfirm={(payout) =>
          onSubmit({
            text: label,
            quote: payout
              ? { ...quote, exec: { ...quote.exec, payout } }
              : quote,
          })
        }
      />
    );
  }

  return (
    <div className="col gap-6">
      <header className="col gap-1">
        <button
          className="btn btn-quiet btn-sm"
          onClick={onBack}
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
          <div className="row center gap-2">
            <input
              value={amount}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9.]/g, "");
                if ((v.match(/\./g) || []).length > 1) return;
                setAmount(v);
              }}
              inputMode="decimal"
              placeholder="0"
              style={{ ...INPUT, fontSize: 22, fontWeight: 500 }}
            />
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              style={{ ...INPUT, width: "auto", flex: "0 0 auto", cursor: "pointer" }}
            >
              {PAYCREST_FIAT.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
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
