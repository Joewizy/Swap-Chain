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

import React, { useState } from "react";
import { DEFAULT_SETTLEMENT_CHAIN_ID, getChain } from "@/config/network";
import { PAYCREST_FIAT } from "@/rails/paycrest";
import { formatAmountInput, formatFiat } from "@/utils";
import {
  ReviewScreen,
  quoteFromIntent,
  type Intent,
  type IntentResponse,
  type Quote,
} from "../SendScreen";
import { Icon } from "../icons";

const TOKENS = ["USDC", "USDT"] as const;

export function CashoutFlow({
  onSubmit,
  onBack,
}: {
  onSubmit: (intent: Intent) => void;
  onBack: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState<(typeof TOKENS)[number]>("USDC");
  const [currency, setCurrency] = useState<string>("NGN");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sourceChain = DEFAULT_SETTLEMENT_CHAIN_ID;
  const sourceName = getChain(sourceChain)?.name ?? sourceChain;
  const canContinue = Number(amount) > 0;
  const label = `Cash out ${amount} ${token} to ${currency}`;

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

    // Estimate the fiat the recipient gets from the live rate (fiat per USDC).
    try {
      const res = await fetch(
        `/api/paycrest/rate?fiat=${encodeURIComponent(currency)}&token=${token}`
      );
      const data = await res.json();
      if (res.ok && data?.rate) {
        r.to.amount = `≈ ${formatFiat(currency, Number(amount) * Number(data.rate))}`;
        r.rate = `${data.rate} ${currency}/${token}`;
      }
    } catch {
      // Rate is a nicety — the exact figure comes from the order invoice.
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
          Cash out
        </h1>
        <span className="muted" style={{ fontSize: 14 }}>
          Send stablecoins to a bank or mobile money account.
        </span>
      </header>

      <div className="card col gap-5" style={{ padding: 20 }}>
        <Field label="Amount">
          <div className="row center gap-2">
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
          <span className="muted" style={{ fontSize: 12 }}>
            From your {token} on {sourceName}
          </span>
        </Field>

        <Field label="Recipient gets paid in">
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            style={{ ...INPUT, cursor: "pointer" }}
          >
            {PAYCREST_FIAT.map((c) => (
              <option key={c} value={c}>
                {c}
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
