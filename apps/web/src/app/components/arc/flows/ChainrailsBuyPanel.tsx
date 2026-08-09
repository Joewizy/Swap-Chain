"use client";

/**
 * ChainrailsBuyPanel — the Buy body for chains Paycrest can't reach.
 *
 * Paycrest is our #1 on-ramp; this panel only renders for the ChainRails-only
 * destinations (Optimism, Avalanche, Solana, Monad, HyperEVM, Tron). It builds
 * the same `Quote` shape the Paycrest flow does and hands it up so the shared
 * <ReviewScreen> renders the confirm step — one consistent order-details card,
 * and it collects the delivery address there (validated per chain format).
 *
 * UX matches the Paycrest flow: the user types a FIAT amount and sees the ≈USDC
 * they'll receive below. Chainrails quotes are crypto-amount-driven and it has
 * no rate endpoint, so we probe one small quote per country to learn the rate,
 * then convert locally as they type (like usePaycrestRate does for Paycrest).
 */

import React, { useEffect, useState } from "react";
import { formatNumber, formatToken } from "@/utils";
import { type RampDestination } from "@/rails/chainrails";
import type { TokenSymbol } from "@/config/network";
import { PrefixedAmountInput } from "./PrefixedAmountInput";
import { type Quote } from "../SendScreen";
import { Icon } from "../icons";
import { EMAIL_RE, loadSavedEmail, saveEmail } from "../rampEmail";

type Country = {
  countryCode: string;
  name: string;
  currency: { code: string; name: string; symbol: string; minAmount: number };
};

type FieldOption = { label: string; value: string };
type FieldSpec = {
  key: string;
  label: string;
  type: string; // "phone" | "string" | "enum" | ...
  required?: boolean;
  options?: FieldOption[];
};

type RampQuote = {
  provider: string;
  quoteId?: string;
  fiatCurrency: string;
  fiatAmount: number;
  cryptoCurrency: string;
  cryptoAmount: number;
  // The SDK returned `exchangeRate`; the REST endpoint returns
  // `exchangeRatePerUSD`. Both are fiat per ~1 USDC.
  exchangeRate?: number;
  exchangeRatePerUSD?: number;
  totalFeesFiat?: number;
  paymentChannels?: {
    id?: string;
    name?: string;
    channel?: string;
    directTransferDetails?: { fieldsRequired?: FieldSpec[] };
  }[];
  rampChain: string;
  requiresBridge: boolean;
};

/** Fiat per 1 USDC, tolerant of both response shapes. */
function quoteRate(q: RampQuote): number {
  return q.exchangeRate ?? q.exchangeRatePerUSD ?? 0;
}

/** FONBNK-style provider fields the order needs (bank dropdown, phone, account). */
function requiredFieldsOf(q: RampQuote | undefined): FieldSpec[] {
  return q?.paymentChannels?.[0]?.directTransferDetails?.fieldsRequired ?? [];
}

// A small crypto amount to probe the corridor's exchange rate with. The rate is
// amount-independent, so this only needs to clear the provider minimum.
const RATE_PROBE_CRYPTO = 10;

export function ChainrailsBuyPanel({
  destination,
  onQuote,
  networkSelect,
}: {
  destination: RampDestination;
  /** Hand the built quote up so the shared ReviewScreen renders the confirm. */
  onQuote: (quote: Quote) => void;
  /** The shared "Receive on" network picker, rendered inside this card. */
  networkSelect: React.ReactNode;
}) {
  const [countries, setCountries] = useState<Country[]>([]);
  const [countryCode, setCountryCode] = useState("NG");
  // `amount` is the FIAT the user pays.
  const [amount, setAmount] = useState("");
  const [unitRate, setUnitRate] = useState<number | null>(null); // fiat per 1 USDC
  const [rateLoading, setRateLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // FONBNK on-ramp requires phone/bank/account to create the order; the fields
  // (and the dynamic bank list) come from the quote's directTransferDetails.
  const [fields, setFields] = useState<FieldSpec[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  // Contact/KYC email — entered once, then remembered on-device and reused
  // (shared with Sell). We only prompt when nothing is saved yet.
  const [email, setEmail] = useState("");
  const [askEmail, setAskEmail] = useState(false);
  useEffect(() => {
    const saved = loadSavedEmail();
    if (saved) setEmail(saved);
    else setAskEmail(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/chainrails/ramp/countries")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Couldn't load countries.");
        if (cancelled) return;
        const next = (data.countries ?? []) as Country[];
        setCountries(next);
        if (!next.some((c) => c.countryCode === "NG") && next[0])
          setCountryCode(next[0].countryCode);
      })
      .catch(
        (err) =>
          !cancelled &&
          setError(
            err instanceof Error ? err.message : "Couldn't load countries."
          )
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const country = countries.find((c) => c.countryCode === countryCode);

  // Probe one quote per country/chain to learn the exchange rate.
  useEffect(() => {
    if (!country) return;
    let cancelled = false;
    setUnitRate(null);
    setRateLoading(true);
    fetch("/api/chainrails/ramp/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fiatCurrency: country.currency.code,
        cryptoAmount: RATE_PROBE_CRYPTO,
        destinationChain: destination.chainrailsChain,
        countryCode,
      }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || cancelled) return;
        const q = (data.recommended ?? data.quotes?.[0]) as
          RampQuote | undefined;
        if (q && quoteRate(q) > 0) setUnitRate(quoteRate(q));
        // Learn which provider fields the order needs + seed enum defaults.
        const req = requiredFieldsOf(q);
        setFields(req);
        setFieldValues((prev) => {
          const next = { ...prev };
          for (const f of req) {
            if (f.type === "enum" && f.options?.[0] && !next[f.key])
              next[f.key] = f.options[0].value;
          }
          return next;
        });
      })
      .catch(() => {})
      .finally(() => !cancelled && setRateLoading(false));
    return () => {
      cancelled = true;
    };
  }, [countryCode, country, destination.chainrailsChain]);

  const fiatAmount = Number(amount);
  const estimateUsdc =
    unitRate && fiatAmount > 0 ? fiatAmount / unitRate : null;
  const belowMin =
    !!country && fiatAmount > 0 && fiatAmount < country.currency.minAmount;
  const fieldsComplete = fields.every(
    (f) => !f.required || (fieldValues[f.key]?.trim()?.length ?? 0) > 0
  );
  const emailValid = EMAIL_RE.test(email.trim());
  const canQuote =
    !!country &&
    fiatAmount > 0 &&
    !!unitRate &&
    !belowMin &&
    fieldsComplete &&
    emailValid;

  const buildQuote = (r: RampQuote, c: Country): Quote => ({
    from: { token: r.fiatCurrency, chain: c.name, amount: r.fiatAmount },
    to: {
      kind: "Wallet",
      currency: r.cryptoCurrency,
      amount: formatToken(r.cryptoAmount, r.cryptoCurrency, 4),
      label: destination.label,
      sub: "",
    },
    rate: `1 ${r.cryptoCurrency} = ${formatNumber(quoteRate(r))} ${r.fiatCurrency}`,
    fee: {
      network: r.requiresBridge
        ? "Included (cross-chain delivery)"
        : "Included",
      rail:
        r.totalFeesFiat != null
          ? `${formatNumber(r.totalFeesFiat)} ${r.fiatCurrency}`
          : "Included in provider quote",
      spread: "Included in provider quote",
      total:
        r.totalFeesFiat != null
          ? `${formatNumber(r.totalFeesFiat)} ${r.fiatCurrency}`
          : "Included in provider quote",
    },
    eta: r.requiresBridge ? "≈ 3–10 min" : "≈ 1–3 min",
    rail: ["Pay provider", r.requiresBridge ? "Bridge" : "Deliver", "Receive"],
    kind: "fiat",
    railName: "Fiat",
    railReason: `Delivered to your ${destination.label} address.`,
    exec: {
      rail: "chainrails",
      action: "onramp",
      fromChain: destination.chainId ?? "ethereum",
      fromToken: r.fiatCurrency as TokenSymbol,
      fromAmount: String(r.fiatAmount),
      toChain: destination.chainId,
      toToken: "USDC",
      fiatCurrency: r.fiatCurrency,
      recipient: null,
      chainrailsRamp: {
        provider: r.provider,
        countryCode,
        cryptoAmount: r.cryptoAmount,
        paymentChannelId:
          r.paymentChannels?.[0]?.id ?? r.paymentChannels?.[0]?.channel,
        destinationChain: destination.chainrailsChain,
        destinationLabel: destination.label,
        addressKind: destination.addressKind,
        fields: { ...fieldValues },
      },
    },
  });

  const getQuote = async () => {
    if (!country || !canQuote || !unitRate) return;
    saveEmail(email.trim()); // remember it for next time (passed emailValid gate)
    // Convert the fiat the user typed into the crypto amount Chainrails quotes on.
    const cryptoAmount = Number((fiatAmount / unitRate).toFixed(4));
    setQuoting(true);
    setError(null);
    try {
      const res = await fetch("/api/chainrails/ramp/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fiatCurrency: country.currency.code,
          cryptoAmount,
          destinationChain: destination.chainrailsChain,
          countryCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Couldn't get a quote.");
      const selected = (data.recommended ?? data.quotes?.[0]) as
        RampQuote | undefined;
      if (!selected)
        throw new Error("No provider can quote this purchase right now.");
      onQuote(buildQuote(selected, country));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't get a quote.");
    } finally {
      setQuoting(false);
    }
  };

  return (
    <div className="card col gap-5" style={{ padding: 20 }}>
      <label className="col gap-2">
        <span className="font-mono" style={LABEL}>
          You pay
        </span>
        <PrefixedAmountInput
          amount={amount}
          onAmountChange={setAmount}
          prefix={country?.currency.symbol ?? "$"}
        />
        {unitRate && estimateUsdc !== null && (
          <div
            className="row center gap-2"
            style={{ fontSize: 12.5, padding: "0 2px" }}
          >
            <span style={{ color: "var(--accent)", fontWeight: 500 }}>
              You receive ≈ {formatToken(estimateUsdc, "USDC", 2)}
            </span>
            <span className="muted font-mono tabular">
              (1 USDC = {formatNumber(unitRate)} {country?.currency.code})
            </span>
          </div>
        )}
        {unitRate && estimateUsdc !== null && (
          <span
            className="muted"
            style={{ fontSize: 11, padding: "0 2px", opacity: 0.85 }}
          >
            Estimate · final rate locks when you create the order
          </span>
        )}
        {!rateLoading && country && !unitRate && (
          <span style={{ fontSize: 12, color: "var(--pend)" }}>
            Couldn&apos;t load a live rate for {destination.label} in{" "}
            {country.currency.code} right now.
          </span>
        )}
      </label>

      <label className="col gap-2">
        <span className="font-mono" style={LABEL}>
          Paying with
        </span>
        <select
          value={countryCode}
          onChange={(e) => setCountryCode(e.target.value)}
          disabled={loading}
          style={INPUT}
        >
          {countries.map((c) => (
            <option key={c.countryCode} value={c.countryCode}>
              {c.name} · {c.currency.code}
            </option>
          ))}
        </select>
      </label>

      <label className="col gap-2">
        <span className="font-mono" style={LABEL}>
          Receive
        </span>
        {networkSelect}
        <span className="muted" style={{ fontSize: 12 }}>
          Your USDC is delivered straight to your {destination.label} address.
        </span>
      </label>

      {/* Provider fields the order requires (bank dropdown, phone, account). */}
      {fields.map((f) => (
        <label key={f.key} className="col gap-2">
          <span className="font-mono" style={LABEL}>
            {f.label}
          </span>
          {f.type === "enum" ? (
            <select
              value={fieldValues[f.key] ?? ""}
              onChange={(e) =>
                setFieldValues((p) => ({ ...p, [f.key]: e.target.value }))
              }
              style={INPUT}
            >
              {(f.options ?? []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={fieldValues[f.key] ?? ""}
              onChange={(e) =>
                setFieldValues((p) => ({ ...p, [f.key]: e.target.value }))
              }
              inputMode={f.type === "phone" ? "tel" : undefined}
              placeholder={f.label}
              style={INPUT}
            />
          )}
        </label>
      ))}

      {/* Asked once; afterwards it's remembered on-device and this is hidden. */}
      {askEmail && (
        <label className="col gap-2">
          <span className="font-mono" style={LABEL}>
            Email (for KYC &amp; receipts)
          </span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            inputMode="email"
            placeholder="you@example.com"
            style={INPUT}
          />
        </label>
      )}

      {belowMin && country && (
        <span style={{ fontSize: 12, color: "var(--pend)" }}>
          Minimum is {formatNumber(country.currency.minAmount)}{" "}
          {country.currency.code}.
        </span>
      )}
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

      <button
        className="btn btn-fat"
        disabled={loading || quoting || !canQuote}
        onClick={getQuote}
        style={{
          background: canQuote ? "var(--btn-bg)" : "var(--bg-sunk)",
          color: canQuote ? "var(--btn-fg)" : "var(--fg-faint)",
          cursor: canQuote && !quoting && !rateLoading ? "pointer" : "default",
        }}
      >
        {quoting ? (
          <>
            <Icon.Spinner size={14} /> Getting live quote…
          </>
        ) : rateLoading ? (
          <>
            <Icon.Spinner size={14} /> Loading rate…
          </>
        ) : (
          <>
            Continue <Icon.ArrowRight />
          </>
        )}
      </button>
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

// Matches the Paycrest buy card's field labels.
const LABEL: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: 0.06,
  color: "var(--fg-mute)",
  textTransform: "uppercase",
};
