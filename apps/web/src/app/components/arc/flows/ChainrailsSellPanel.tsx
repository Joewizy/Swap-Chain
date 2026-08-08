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
import { useAccount } from "wagmi";
import { formatNumber, formatToken, fiatSymbol, currencyLabel } from "@/utils";
import {
  classifyRampStatus,
  isValidRampAddress,
  toE164,
  type RampDestination,
  type RampOrderPhase,
} from "@/rails/chainrails";
import { pollRampOrder } from "@/lib/chainrailsPoll";
import { getChainIcon, getTokenIcon } from "@/utils/icons";
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

/**
 * The exact amount to deposit. ChainRails' live order has moved this between
 * field names across versions, so we scan the likely candidates and take the
 * first positive number rather than trusting one key.
 */
function pickDepositAmount(order: Record<string, unknown>): number | undefined {
  const keys = [
    "grossDepositAmount",
    "intentAmount",
    "depositAmount",
    "sourceAmount",
    "cryptoAmount",
    "amount",
  ];
  for (const k of keys) {
    const n = Number(order[k]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

/** Colored Iconify name for a chain (e.g. "Solana"), or null when unavailable. */
function chainLogo(label: string): string | null {
  const name = getChainIcon(label);
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
  cryptoCurrency?: string;
  depositChain?: string;
};

/**
 * The KYC email is the same every time for a given person, so we remember the
 * last one this device used (like recipients/orders) and prefill it — no
 * re-typing on every sell. Device-local; never leaves the browser.
 */
const EMAIL_KEY = "railglide:ramp:email";
function loadSavedEmail(): string {
  try {
    return localStorage.getItem(EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}
function saveEmail(email: string) {
  try {
    localStorage.setItem(EMAIL_KEY, email);
  } catch {
    /* localStorage unavailable — email just won't persist this session. */
  }
}

export function ChainrailsSellPanel({
  source,
  networkSelect,
  resumeOrderId,
  resumeFiatLabel,
  resumeDepositLabel,
  resumeCryptoLabel,
  onOrderActive,
  onStartNew,
}: {
  source: RampDestination;
  /** The shared "From" chain picker, rendered inside this card. */
  networkSelect?: React.ReactNode;
  /** Re-open an existing order (from History) instead of creating one. */
  resumeOrderId?: string;
  /** Pre-formatted payout amount (e.g. "6,722 NGN") shown while resuming, since
   *  a resumed order arrives without the original quote. */
  resumeFiatLabel?: string;
  /** Pre-formatted deposit amount (e.g. "5.0275 USDC") for the same reason. */
  resumeDepositLabel?: string;
  /** Last-resort amount (the sell figure) for orders saved before we captured
   *  the exact deposit amount. */
  resumeCryptoLabel?: string;
  /** Tells the parent flow when the order screen is showing, so it can drop its
   *  own "Sell" title and leave the status headline to us (matches the Buy flow). */
  onOrderActive?: (active: boolean) => void;
  /** Clears the resumed order in the parent (URL + state) when starting over. */
  onStartNew?: () => void;
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

  // Prefill the remembered KYC email (runs client-side only, avoids SSR mismatch).
  useEffect(() => {
    const saved = loadSavedEmail();
    if (saved) setEmail(saved);
  }, []);

  // Resume mode: re-open an order from History. Fetch it once, then the poll
  // effect below keeps it live — the user lands straight on the deposit screen
  // exactly where they left off, instead of a dead end.
  useEffect(() => {
    if (!resumeOrderId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/chainrails/ramp/orders/${resumeOrderId}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error();
        const data = (await res.json()) as RampOrder | null;
        if (cancelled) return;
        if (!data) throw new Error();
        setOrder(data);
        setPhase(classifyRampStatus(data.status));
      } catch {
        if (!cancelled)
          setError("We couldn't reopen this order. Try again from History.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resumeOrderId]);

  // Prefill the "sending from" address with the connected wallet — but only for
  // EVM sources, since that's the only address the wallet gives us (Solana/Tron
  // sources are pasted manually). Only fills an empty field, so we never stomp
  // an address the user typed.
  const { address: connectedAddress } = useAccount();
  useEffect(() => {
    if (source.addressKind === "evm" && connectedAddress && !senderAddress) {
      setSenderAddress(connectedAddress);
    }
  }, [source.addressKind, connectedAddress, senderAddress]);
  // The field still holds the wallet address (user hasn't overridden it).
  const usingWalletAddress =
    !!connectedAddress &&
    senderAddress.trim().toLowerCase() === connectedAddress.toLowerCase();

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
    saveEmail(email.trim()); // remember it for next time (passed emailValid gate)
    try {
      // Phone-type fields must go out in E.164 (+234…). A local 0817… format
      // makes FONBNK's backend throw and Chainrails returns an opaque 500.
      const phoneKeys = new Set(
        requiredFields.filter((f) => f.type === "phone").map((f) => f.key)
      );
      const fields: Record<string, string> = {};
      for (const [key, value] of Object.entries(fieldValues)) {
        fields[key] = phoneKeys.has(key) ? toE164(value, countryCode) : value;
      }
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
          fields,
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
        // The exact deposit figure (fee-inclusive) so a resumed order shows the
        // right amount to send even though the quote is long gone.
        depositLabel: `${quote.grossDepositAmount} ${quote.cryptoCurrency}`,
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

  // Poll the created order via the shared ramp poller (as Buy/Paycrest do): it
  // backs off toward 30s, pauses while the tab is hidden, and stops itself once
  // the order settles. Keyed on the order id alone.
  const orderId = order?.id;
  useEffect(() => {
    if (orderId == null) return;
    const handle = pollRampOrder<RampOrder>(orderId, {
      onUpdate: (data) => {
        setOrder(data);
        setPhase(classifyRampStatus(data.status));
      },
      onSettled: (data, settledPhase) => {
        if (data) setOrder(data);
        setPhase(settledPhase);
      },
    });
    return () => handle.stop();
  }, [orderId]);

  // Let the parent flow know the order screen owns the headline now.
  useEffect(() => {
    onOrderActive?.(!!order || !!resumeOrderId);
  }, [order, resumeOrderId, onOrderActive]);

  // Abandon a dead order and return to a blank sell form. Clears the parent's
  // resumed order too (via onStartNew) so the URL doesn't reopen it.
  const startNewOrder = () => {
    setOrder(null);
    setQuote(null);
    setPhase("pending");
    setError(null);
    setAmount("");
    setFieldValues({});
    onStartNew?.();
  };

  // ----- Order created: two-panel deposit + live progress ------------------
  if (order) {
    // Friendly network name only — never the raw "SOLANA_MAINNET" enum.
    const networkLabel = source.label;
    const cryptoCurrency =
      order.cryptoCurrency ?? quote?.cryptoCurrency ?? "USDC";
    const paidOut = phase === "completed";
    const failed = phase === "expired" || phase === "failed";
    // Deposit amount: from the live order (field name varies, so scan several),
    // the quote, or the figures we stored in History. Falls back to the sell
    // amount for legacy orders saved before we captured the exact deposit.
    const depositAmount =
      pickDepositAmount(order as Record<string, unknown>) ??
      quote?.grossDepositAmount;
    const amountLabel =
      depositAmount != null
        ? `${depositAmount} ${cryptoCurrency}`
        : (resumeDepositLabel ?? resumeCryptoLabel ?? "—");
    const fiatLine =
      quote?.fiatAmount != null
        ? `${fiatSymbol(quote.fiatCurrency)}${formatNumber(quote.fiatAmount)}`
        : (resumeFiatLabel ?? "—");

    const steps = [
      { l: "Order created", d: "Your quote is locked and the payout is set up." },
      {
        l: "Send your crypto",
        d: `Send exactly ${amountLabel} on ${networkLabel}.`,
      },
      {
        l: "Confirming",
        d: "We confirm the deposit on-chain, then release the payout.",
      },
      { l: "Paid out", d: `${fiatLine} lands in the recipient's account.` },
    ];
    // Timeline reflects the real phase: the order exists, so step 0 is always
    // done; pending waits on the deposit, processing is confirming.
    let activeIndex: number;
    let failedIndex = -1;
    if (failed) {
      failedIndex = 1;
      activeIndex = 1;
    } else if (paidOut) {
      activeIndex = steps.length;
    } else if (phase === "processing") {
      activeIndex = 2;
    } else {
      activeIndex = 1;
    }
    const failedPhase = failedIndex >= 0;
    // Big status headline, mirroring the Buy status screen so the two match.
    const statusTitle = paidOut
      ? "Paid out"
      : phase === "expired"
        ? "Deposit window expired"
        : phase === "failed"
          ? "Order couldn't complete"
          : phase === "processing"
            ? "Confirming your payment"
            : "Send your crypto";
    const statusSubtitle = paidOut
      ? `${fiatLine} was sent to the recipient's account.`
      : phase === "processing"
        ? "Your deposit is confirming on-chain — the payout releases shortly."
        : `Send exactly ${amountLabel} to the address below to complete the payout.`;

    return (
      <div className="cr-status col" style={{ maxWidth: 880 }}>
        <header className="cr-status-header col">
          <span className="row center gap-2">
            <span className="eyebrow">Status</span>
            {failed && (
              <span className="chip chip-err">
                {phase === "expired" ? "Expired" : "Failed"}
              </span>
            )}
          </span>
          <h1
            style={{
              fontSize: "clamp(28px, 3.6vw, 42px)",
              lineHeight: 1.03,
              letterSpacing: "-0.03em",
              fontWeight: 500,
            }}
          >
            {statusTitle}
          </h1>
          {!failed && (
            <span className="muted" style={{ fontSize: 14, lineHeight: 1.4 }}>
              {statusSubtitle}
            </span>
          )}
        </header>

        <div
          className="cr-status-grid"
          style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(240px, 280px)" }}
        >
          {/* Left — summary + the deposit action */}
          <div className="cr-status-main">
            <div
              className="cr-status-amounts"
              style={failed ? { opacity: 0.5 } : undefined}
            >
              <div className="card cr-status-amount">
                <span className="eyebrow">You sell</span>
                <span
                  className="font-mono tabular row center gap-2 cr-status-amount-value"
                  style={{ whiteSpace: "nowrap" }}
                >
                  <AssetLogo name={tokenLogo(cryptoCurrency)} size={18} />
                  {amountLabel}
                </span>
                <span
                  className="muted font-mono row center gap-1"
                  style={{ fontSize: 12, minWidth: 0 }}
                >
                  <AssetLogo name={chainLogo(networkLabel)} size={12} />
                  {networkLabel}
                </span>
              </div>
              <div className="card cr-status-amount">
                <span className="eyebrow">You receive</span>
                <span
                  className="font-mono tabular cr-status-amount-value"
                  style={{ color: "var(--accent)", whiteSpace: "nowrap" }}
                >
                  {fiatLine}
                </span>
                <span className="muted" style={{ fontSize: 12 }}>
                  To the recipient&apos;s bank account
                </span>
              </div>
            </div>

            {order.intentAddress && phase === "pending" && (
              <DepositAddress
                address={order.intentAddress}
                amountLabel={amountLabel}
                network={networkLabel}
              />
            )}

            {/* Active reassurance — always answers "what now / what next". */}
            {phase === "pending" && (
              <div
                className="row center gap-2"
                style={{
                  justifyContent: "center",
                  fontSize: 12.5,
                  color: "var(--fg-soft)",
                }}
              >
                <Icon.Spinner size={13} />
                <span>
                  Waiting for your deposit — we&apos;ll send {fiatLine} to the
                  recipient once it arrives.
                </span>
              </div>
            )}

            {phase === "processing" && (
              <div
                className="card row center gap-2"
                style={{ padding: 16 }}
              >
                <Icon.Spinner size={15} />
                <span style={{ fontSize: 13.5 }}>
                  Deposit received — sending {fiatLine} to the recipient&apos;s
                  account.
                </span>
              </div>
            )}

            {paidOut && (
              <div
                className="card row center gap-2"
                style={{
                  padding: 16,
                  background: "var(--ok-soft)",
                  border: "1px solid var(--ok)",
                }}
              >
                <Icon.Check size={16} />
                <span style={{ fontSize: 13.5 }}>
                  {fiatLine} paid out successfully.
                </span>
              </div>
            )}

            {failed && (
              <div className="card col gap-2" style={{ padding: 16 }}>
                <span style={{ fontSize: 14.5, fontWeight: 600 }}>
                  No payout was made.
                </span>
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--fg-soft)",
                    lineHeight: 1.5,
                  }}
                >
                  {phase === "expired"
                    ? `We didn't receive your ${amountLabel} in time. If you already sent it, it will be refunded to your wallet.`
                    : "The provider couldn't process this order. If you already sent your crypto, it will be refunded to your wallet."}
                </span>
              </div>
            )}

            {failed && (
              <button
                className="btn btn-primary cr-status-action"
                onClick={startNewOrder}
              >
                Start new order <Icon.ArrowRight />
              </button>
            )}

            <div className="cr-status-ref row between center">
              <CopyableOrderId id={String(order.id)} />
              <span
                className="row center gap-1 muted"
                style={{ fontSize: 11 }}
              >
                <Icon.Shield size={12} /> Released only after your deposit
                confirms
              </span>
            </div>
          </div>

          {/* Right — progress tracker */}
          <div className="card cr-status-card cr-status-progress">
            <span className="eyebrow">Progress</span>
            {steps.map((s, i) => {
              const isFailed = failedIndex === i;
              const isDone = failedPhase
                ? i < failedIndex
                : paidOut || i < activeIndex;
              const isActive = !failedPhase && !paidOut && i === activeIndex;
              const statusLabel = isFailed
                ? phase === "expired"
                  ? "expired"
                  : "failed"
                : isDone
                  ? "done"
                  : isActive
                    ? "now"
                    : "next";
              const dim = !isDone && !isActive && !isFailed ? 0.5 : 1;
              return (
                <div
                  key={i}
                  className="row"
                  style={{
                    gap: 12,
                    paddingBottom: i < steps.length - 1 ? 12 : 0,
                    alignItems: "flex-start",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      flex: "0 0 20px",
                    }}
                  >
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        background: isFailed
                          ? "var(--err)"
                          : isDone
                            ? "var(--ok)"
                            : isActive
                              ? "var(--accent)"
                              : "var(--bg-sunk)",
                        color:
                          isDone || isActive || isFailed
                            ? "#fff"
                            : "var(--fg-mute)",
                        border:
                          !isDone && !isActive && !isFailed
                            ? "1px solid var(--line-2)"
                            : "none",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        animation:
                          isActive && !isFailed
                            ? "pulse-ring 1.4s var(--ease) infinite"
                            : "none",
                      }}
                    >
                      {isFailed ? (
                        <span style={{ fontSize: 12 }}>!</span>
                      ) : isDone ? (
                        <Icon.Check size={11} />
                      ) : (
                        <span className="font-mono" style={{ fontSize: 10 }}>
                          {i + 1}
                        </span>
                      )}
                    </div>
                    {i < steps.length - 1 && (
                      <div
                        style={{
                          width: 1,
                          flex: 1,
                          minHeight: 16,
                          background: isDone ? "var(--ok)" : "var(--line)",
                          marginTop: 3,
                        }}
                      />
                    )}
                  </div>
                  <div className="col grow gap-1" style={{ opacity: dim }}>
                    <div className="row between" style={{ alignItems: "baseline" }}>
                      <h4
                        style={{
                          fontSize: 13.5,
                          lineHeight: 1.25,
                          fontWeight: 500,
                        }}
                      >
                        {s.l}
                      </h4>
                      <span
                        className="font-mono"
                        style={{
                          fontSize: 9,
                          color: "var(--fg-mute)",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          lineHeight: 1,
                        }}
                      >
                        {statusLabel}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: 12,
                        lineHeight: 1.4,
                        color: "var(--fg-soft)",
                      }}
                    >
                      {s.d}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ----- Resuming from History: fetching the order before we can show it ----
  if (resumeOrderId && !order) {
    return (
      <div className="card col center gap-3" style={{ padding: "40px 24px" }}>
        {!error && <Icon.Spinner size={18} />}
        <span className="muted" style={{ fontSize: 13 }}>
          {error ?? "Reopening your order…"}
        </span>
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
        <div className="row center gap-1">
          <span className="eyebrow">
            Your {source.label} address (sending from)
          </span>
          {usingWalletAddress && (
            <InfoHint
              text={`This is your connected wallet address. You can sell from any ${source.label} address — just paste a different one here.`}
            />
          )}
        </div>
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

/** Order number that copies to the clipboard on tap — useful for support. */
function CopyableOrderId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard
          ?.writeText(id)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          })
          .catch(() => {})
      }
      className="font-mono muted transition-colors hover:text-[var(--fg)]"
      title="Copy order number"
      aria-label="Copy order number"
      style={{
        background: "transparent",
        border: 0,
        padding: 0,
        cursor: "pointer",
        fontSize: 12,
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
      }}
    >
      Order #{id}
      {copied ? <Icon.Check size={11} /> : <Icon.Copy size={11} />}
    </button>
  );
}

/**
 * The deposit address the user sends their crypto to — the real action on
 * chains we can't sign in-app. Shown in full (the user needs every character)
 * with a one-tap copy that confirms, so nobody hand-types a wallet address.
 */
function DepositAddress({
  address,
  amountLabel,
  network,
}: {
  address: string;
  amountLabel: string;
  network: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    navigator.clipboard
      ?.writeText(address)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      })
      .catch(() => {});

  return (
    <div className="card col gap-3" style={{ padding: 18 }}>
      <div className="col gap-1">
        <span className="eyebrow">Send to this address</span>
        <span className="muted" style={{ fontSize: 12, lineHeight: 1.45 }}>
          Send exactly {amountLabel} on {network} from your own wallet. The
          amount must match for the payout to release.
        </span>
      </div>
      <code
        className="font-mono"
        style={{
          fontSize: 12.5,
          lineHeight: 1.5,
          wordBreak: "break-all",
          background: "var(--bg-soft)",
          border: "1px solid var(--line)",
          borderRadius: 12,
          padding: "12px 14px",
        }}
      >
        {address}
      </code>
      <button
        className="btn btn-primary"
        onClick={copy}
        style={{ height: 44, borderRadius: 12, fontWeight: 500 }}
      >
        {copied ? (
          <>
            <Icon.Check size={14} /> Copied
          </>
        ) : (
          <>
            <Icon.Copy size={14} /> Copy deposit address
          </>
        )}
      </button>
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
