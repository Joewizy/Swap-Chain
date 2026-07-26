"use client";

/**
 * ChainrailsSellPanel — off-ramp (crypto → fiat) for chains Paycrest can't
 * reach (Solana, Tron, Optimism, Avalanche, Monad, HyperEVM).
 *
 * The payout bank list is DYNAMIC: the quote returns each provider's
 * `paymentChannels[].directTransferDetails.fieldsRequired`, where the
 * `bankCode` field is an enum whose options are the banks. We render those
 * fields straight from the quote, then send the chosen values in the order's
 * `fields`. Delivery is manual: the order returns a deposit address the user
 * sends their crypto to (no in-app signing on these chains).
 *
 * NOTE: this whole panel is currently unreachable — off-ramp is paused behind
 * `CHAINRAILS_OFFRAMP_ENABLED` (false) until RailGlide completes Fiat KYB with
 * the provider. The order payload is correct (`userEmail` top-level, no
 * `quoteId`); it's the account-level KYB, not the request, that's outstanding.
 */

import React, { useEffect, useState } from "react";
import { formatNumber, formatToken, fiatSymbol, currencyLabel } from "@/utils";
import {
  classifyRampStatus,
  isRampPhaseTerminal,
  isValidRampAddress,
  type RampDestination,
  type RampOrderPhase,
} from "@/rails/chainrails";
import { getTokenIcon } from "@/utils/icons";
import { PrefixedAmountInput } from "./PrefixedAmountInput";
import { InfoHint } from "../SendScreen";
import { Icon } from "../icons";
import { trackRampOrder } from "../chainrailsOrders";

/** Colored Iconify name for a token, or null when there's no real logo. */
function tokenLogo(symbol: string): string | null {
  const name = getTokenIcon(symbol);
  if (name.startsWith("material-symbols:")) return null;
  return name.startsWith("cryptocurrency:")
    ? name.replace("cryptocurrency:", "cryptocurrency-color:")
    : name;
}

/** Real token logo via the Iconify SVG API; hides itself if it 404s. */
function AssetLogo({ name, size }: { name: string | null; size: number }) {
  if (!name) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://api.iconify.design/${name}.svg`}
      width={size}
      height={size}
      alt=""
      loading="lazy"
      style={{ display: "block", borderRadius: 999, flex: "0 0 auto" }}
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

type Country = {
  countryCode: string;
  name: string;
  currency: { code: string; name: string; symbol: string; minAmount: number };
};

type FieldOption = {
  label: string;
  value: string;
  iconUrl?: string | null;
  featured?: boolean | null;
};

type FieldSpec = {
  key: string;
  label: string;
  type: string; // "phone" | "string" | "enum" | ...
  required?: boolean;
  options?: FieldOption[];
};

type PaymentChannel = {
  channel: string;
  transferType: string;
  directTransferDetails?: { fieldsRequired?: FieldSpec[] };
};

type OffQuote = {
  provider: string;
  fiatCurrency: string;
  fiatAmount: number;
  exchangeRatePerUSD: number;
  cryptoCurrency: string;
  cryptoAmount: number;
  grossDepositAmount: number;
  depositChain: string;
  requiresBridge: boolean;
  paymentChannels: PaymentChannel[];
  totalFeesFiat: number;
};

type RampOrder = {
  id: number | string;
  status: string;
  intentAddress?: string;
  grossDepositAmount?: number;
  cryptoCurrency?: string;
  depositChain?: string;
};

const POLL_MS = 5000;

export function ChainrailsSellPanel({
  source,
  networkSelect,
}: {
  source: RampDestination;
  /** The shared "From" chain picker, rendered inside this card. */
  networkSelect?: React.ReactNode;
}) {
  const [countries, setCountries] = useState<Country[]>([]);
  const [countryCode, setCountryCode] = useState("NG");
  const [amount, setAmount] = useState("");
  const [senderAddress, setSenderAddress] = useState("");
  const [email, setEmail] = useState("");
  const [quote, setQuote] = useState<OffQuote | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [order, setOrder] = useState<RampOrder | null>(null);
  const [phase, setPhase] = useState<RampOrderPhase>("pending");

  const [loading, setLoading] = useState(true);
  const [quoting, setQuoting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const cryptoAmount = Number(amount);
  const senderValid = isValidRampAddress(source.addressKind, senderAddress);
  const canQuote = !!country && cryptoAmount > 0 && senderValid;

  const requiredFields: FieldSpec[] =
    quote?.paymentChannels[0]?.directTransferDetails?.fieldsRequired ?? [];

  const getQuote = async () => {
    if (!country || !canQuote) return;
    setQuoting(true);
    setError(null);
    try {
      const res = await fetch("/api/chainrails/ramp/offramp-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fiatCurrency: country.currency.code,
          cryptoAmount,
          sourceChain: source.chainrailsChain,
          countryCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Couldn't get a quote.");
      const selected = (data.recommended ?? data.quotes?.[0]) as
        OffQuote | undefined;
      if (!selected)
        throw new Error(
          "No provider can fill that amount right now — try a different amount."
        );
      // Seed enum fields with their first option so a valid value is preselected.
      const fields =
        selected.paymentChannels[0]?.directTransferDetails?.fieldsRequired ??
        [];
      const seeded: Record<string, string> = {};
      for (const f of fields) {
        if (f.type === "enum" && f.options?.[0])
          seeded[f.key] = f.options[0].value;
      }
      setFieldValues(seeded);
      setQuote(selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't get a quote.");
    } finally {
      setQuoting(false);
    }
  };

  const fieldsComplete = requiredFields.every(
    (f) => !f.required || (fieldValues[f.key]?.trim()?.length ?? 0) > 0
  );
  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  const createOrder = async () => {
    if (!quote || !country) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/chainrails/ramp/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "off-ramp",
          provider: quote.provider,
          fiatCurrency: quote.fiatCurrency,
          cryptoAmount: quote.cryptoAmount,
          sourceChain: source.chainrailsChain,
          senderAddress: senderAddress.trim(),
          countryCode,
          // userEmail is a TOP-LEVEL KYC field — the provider 403s if it's
          // nested inside `fields`. The orders endpoint also rejects `quoteId`.
          userEmail: email.trim(),
          fields: { ...fieldValues },
        }),
      });
      const data = (await res.json()) as RampOrder & { error?: string };
      if (!res.ok)
        throw new Error(data?.error || "Couldn't create the sell order.");
      setOrder(data);
      setPhase(classifyRampStatus(data.status));
      trackRampOrder({
        id: String(data.id),
        direction: "offramp",
        chainLabel: source.label,
        cryptoLabel: `${quote.cryptoAmount} ${quote.cryptoCurrency}`,
        fiatLabel: `${formatNumber(quote.fiatAmount)} ${quote.fiatCurrency}`,
        address: senderAddress.trim(),
        createdAt: Date.now(),
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't create the sell order."
      );
    } finally {
      setCreating(false);
    }
  };

  // Poll the created order until terminal.
  useEffect(() => {
    if (!order || isRampPhaseTerminal(phase)) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/chainrails/ramp/orders/${order.id}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as RampOrder | null;
        if (cancelled || !data) return;
        setOrder(data);
        setPhase(classifyRampStatus(data.status));
      } catch {
        /* transient — retry next tick */
      }
    };
    void poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [order, phase]);

  // ----- Order created: deposit instructions + live status -----------------
  if (order) {
    const depositAmount = order.grossDepositAmount ?? quote?.grossDepositAmount;
    const depositChain =
      order.depositChain ?? quote?.depositChain ?? source.label;
    const cryptoCurrency =
      order.cryptoCurrency ?? quote?.cryptoCurrency ?? "USDC";
    const done = isRampPhaseTerminal(phase);
    return (
      <div className="card col gap-5" style={{ padding: 20 }}>
        <div className="col gap-1">
          <h2 style={{ fontSize: 18, fontWeight: 500 }}>
            {phase === "completed" ? "Paid out." : "Send your crypto"}
          </h2>
          <span className="muted" style={{ fontSize: 13 }}>
            {phase === "completed"
              ? `${quote?.fiatAmount ? formatNumber(quote.fiatAmount) : ""} ${quote?.fiatCurrency ?? ""} was sent to your bank.`
              : "Send the exact amount to the deposit address to complete the payout."}
          </span>
        </div>

        {order.intentAddress && !done && (
          <div className="col gap-2">
            <Row
              label="Send"
              value={`${depositAmount ?? "—"} ${cryptoCurrency}`}
            />
            <Row label="On" value={depositChain} />
            <div className="col gap-1">
              <span className="muted" style={{ fontSize: 12 }}>
                To this address
              </span>
              <code
                style={{
                  fontSize: 12,
                  wordBreak: "break-all",
                  background: "var(--bg-soft)",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  padding: "8px 10px",
                }}
              >
                {order.intentAddress}
              </code>
            </div>
          </div>
        )}

        <div
          className="row center gap-2"
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            background:
              done && phase === "completed"
                ? "var(--ok-soft)"
                : "var(--bg-soft)",
            border: `1px solid ${done && phase === "completed" ? "var(--ok)" : "var(--line)"}`,
            fontSize: 13,
          }}
        >
          {done ? (
            phase === "completed" ? (
              <Icon.Check size={14} />
            ) : (
              <Icon.Dot size={8} />
            )
          ) : (
            <Icon.Spinner size={14} />
          )}
          <span>{prettyStatus(order.status)}</span>
        </div>

        <Row label="Order" value={`#${order.id}`} />
      </div>
    );
  }

  // ----- Quote in hand: dynamic payout fields + confirm --------------------
  if (quote) {
    const canCreate = fieldsComplete && emailValid && !creating;
    return (
      <div className="col gap-5">
        {/* Headline summary — mirrors the Paycrest "Review & confirm" card. */}
        <div className="card-lg" style={{ padding: 24 }}>
          <div className="row between center wrap" style={{ gap: 18 }}>
            <div className="col">
              <span className="muted" style={{ fontSize: 12 }}>
                You sell
              </span>
              <span
                className="font-mono tabular row center gap-2"
                style={{ fontSize: 30, fontWeight: 500, letterSpacing: "-0.015em" }}
              >
                <AssetLogo name={tokenLogo(quote.cryptoCurrency)} size={22} />
                {formatToken(quote.cryptoAmount, quote.cryptoCurrency, 2)}
              </span>
              <span
                className="muted font-mono"
                style={{ fontSize: 12, marginTop: 4 }}
              >
                {source.label}
              </span>
            </div>
            <Icon.ArrowRight size={22} />
            <div className="col" style={{ alignItems: "flex-end" }}>
              <span className="muted" style={{ fontSize: 12 }}>
                You receive
              </span>
              <span
                className="font-mono tabular"
                style={{
                  fontSize: 30,
                  fontWeight: 500,
                  color: "var(--accent)",
                  letterSpacing: "-0.015em",
                }}
              >
                ≈ {fiatSymbol(quote.fiatCurrency)}
                {formatNumber(quote.fiatAmount)}
              </span>
              <span
                className="muted font-mono"
                style={{ fontSize: 12, marginTop: 4 }}
              >
                1 USD = {formatNumber(quote.exchangeRatePerUSD)}{" "}
                {quote.fiatCurrency}
              </span>
            </div>
          </div>
        </div>

        {/* Payout details */}
        <div className="card col gap-5" style={{ padding: 20 }}>
          <div className="col gap-3">
            <div className="row center gap-1">
              <span className="eyebrow">Payout account</span>
              <InfoHint
                text={`The bank or mobile-money account that receives the ${
                  quote.fiatCurrency
                    ? currencyLabel(quote.fiatCurrency)
                    : "cash"
                } payout.`}
              />
            </div>
            {requiredFields.map((f) => (
              <label key={f.key} className="col gap-1">
                <span className="muted" style={{ fontSize: 12 }}>
                  {f.label}
                  {f.required ? "" : " (optional)"}
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
            <label className="col gap-1">
              <span className="muted" style={{ fontSize: 12 }}>
                Email (for KYC verification)
              </span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                inputMode="email"
                placeholder="you@example.com"
                style={INPUT}
              />
            </label>
          </div>

          {error && <ErrorBox message={error} />}

          <div className="col gap-2">
            <button
              className="btn btn-fat"
              disabled={!canCreate}
              onClick={createOrder}
              style={{
                background: canCreate ? "var(--btn-bg)" : "var(--bg-sunk)",
                color: canCreate ? "var(--btn-fg)" : "var(--fg-faint)",
                cursor: canCreate ? "pointer" : "default",
              }}
            >
              {creating ? (
                <>
                  <Icon.Spinner size={14} /> Creating order…
                </>
              ) : (
                <>
                  Get deposit address <Icon.ArrowRight />
                </>
              )}
            </button>
            <button className="btn btn-quiet" onClick={() => setQuote(null)}>
              Edit
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ----- Form --------------------------------------------------------------
  return (
    <div className="card col gap-5" style={{ padding: 20 }}>
      <label className="col gap-2">
        <span className="eyebrow">You sell</span>
        <PrefixedAmountInput
          amount={amount}
          onAmountChange={setAmount}
          prefix="$"
        />
        <span className="muted" style={{ fontSize: 12 }}>
          USDC amount on {source.label}. The payout is shown in the live quote.
        </span>
      </label>

      {networkSelect && (
        <label className="col gap-2">
          <span className="eyebrow">From</span>
          {networkSelect}
        </label>
      )}

      <label className="col gap-2">
        <span className="eyebrow">Recipient gets paid in</span>
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
        <span className="eyebrow">
          Your {source.label} address (sending from)
        </span>
        <input
          value={senderAddress}
          onChange={(e) => setSenderAddress(e.target.value)}
          placeholder={`Your ${source.label} wallet address`}
          spellCheck={false}
          autoComplete="off"
          style={INPUT}
        />
        {senderAddress.trim() && !senderValid && (
          <span style={{ fontSize: 12, color: "var(--err)" }}>
            That doesn&apos;t look like a valid {source.label} address.
          </span>
        )}
      </label>

      {error && <ErrorBox message={error} />}

      <button
        className="btn btn-fat"
        disabled={loading || quoting || !canQuote}
        onClick={getQuote}
        style={{
          background: canQuote ? "var(--btn-bg)" : "var(--bg-sunk)",
          color: canQuote ? "var(--btn-fg)" : "var(--fg-faint)",
          cursor: canQuote && !quoting ? "pointer" : "default",
        }}
      >
        {quoting ? (
          <>
            <Icon.Spinner size={14} /> Getting live quote…
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="row between" style={{ fontSize: 13 }}>
      <span className="muted">{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: "12px 14px",
        background: "var(--err-soft)",
        border: "1px solid var(--err)",
        borderRadius: 10,
        fontSize: 13,
      }}
    >
      {message}
    </div>
  );
}

/** "ORDER_INITIATED" → "Order initiated". */
function prettyStatus(s: string): string {
  const t = s.replace(/_/g, " ").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
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
