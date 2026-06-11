"use client";

// SendScreen.tsx — describe flow (AssistantChat) + shared review/status UI.
// Guided flows (CashoutFlow, BuyFlow) use ReviewScreen and StatusScreen directly.

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { parseUnits } from "viem";
import { Icon } from "./icons";
import { AssistantChat } from "./AssistantChat";
import type { AssistantHandoff } from "@/assistant/types";
import {
  useCctp,
  usePaycrestOfframp,
  usePaycrestOnramp,
  useRelaySwap,
  useTokenBalance,
  type CctpStatus,
  type PaycrestOfframpStatus,
  type PaycrestOnrampStatus,
  type RelaySwapStatus,
} from "@/hooks";
import type { ExecutionProgress } from "@/hooks/useRelayExecutor";
import { getChain, type ChainId, type TokenSymbol } from "@/config/network";
import type {
  PaycrestFiat,
  PaycrestOrder,
  PaycrestToken,
} from "@/rails/paycrest";
import {
  currencyLabel,
  formatCountdown,
  formatFiat,
  formatNumber,
  formatToken,
  titleCase,
} from "@/utils";

/* ───────── shared modal chrome ─────────
 * Modals portal to <body> so `position: fixed` is viewport-relative (the
 * app shell's fade-up animation creates a containing block that would
 * otherwise trap and mis-center them). No backdrop dim — the elevation
 * shadow alone separates the dialog from the page. */
const MODAL_SHADOW =
  "0 16px 48px rgba(20,18,14,0.28), 0 4px 12px rgba(20,18,14,0.16)";
const MODAL_OVERLAY: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 60,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding:
    "max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom))",
};

/* ───────── types ───────── */
export type RailKey = "cctp" | "chainrails" | "relay" | "paycrest";

/** Bank / mobile-money payout details, collected in Review for off-ramps. */
export type PayoutDetails = {
  /** Paycrest institution code, e.g. "GTBINGLA". */
  institution: string;
  /** Human name for display, e.g. "Guaranty Trust Bank". */
  institutionName: string;
  /** Bank account number or mobile-money phone number. */
  accountIdentifier: string;
  accountName: string;
};

/** Raw routing data StatusScreen needs to actually call a rail. */
export type QuoteExec = {
  rail: RailKey;
  action: "onramp" | "offramp" | "bridge" | "swap";
  fromChain: ChainId;
  fromToken: TokenSymbol;
  /** Decimal string in human units, e.g. "20" for 20 USDC. */
  fromAmount: string;
  toChain: ChainId | null;
  toToken: TokenSymbol | null;
  fiatCurrency: string | null;
  recipient: string | null;
  /** Off-ramp payout target — filled in Review before execution. */
  payout?: PayoutDetails | null;
};

export type Quote = {
  from: { token: string; chain: string; amount: number };
  to: {
    kind: string;
    currency: string;
    amount: string;
    label: string;
    sub: string;
  };
  rate: string | null;
  fee: { network: string; rail: string; spread: string; total: string };
  eta: string;
  rail: string[];
  kind: "fiat" | "crosschain";
  /** Rail the router picked — "CCTP" | "Chainrails" | "Relay" | "Paycrest". */
  railName: string;
  /** Human-readable why-this-rail, from /api/router. */
  railReason: string;
  /** Untyped strings above are for display; this is the source of truth StatusScreen runs against. */
  exec: QuoteExec;
};
export type ParseError = { error: string; reason: string; quote?: Quote };
type ParseResult = Quote | ParseError | null;
export type Intent = {
  text: string;
  quote: Quote;
  /** When set, StatusScreen adopts this existing order instead of creating one. */
  resumeOrderId?: string;
};

/* ───────── real intent → route pipeline ───────── */

/** The slice of /api/intent's response this screen reads. */
export type IntentResponse = {
  action: "onramp" | "offramp" | "bridge" | "swap" | "unclear";
  fromChain: string | null;
  fromToken: string | null;
  fromAmount: string | null;
  toChain: string | null;
  toToken: string | null;
  fiatCurrency: string | null;
  recipient: string | null;
  needsClarification: boolean;
  clarificationQuestion: string | null;
  confidence: number;
};

/** The slice of /api/router's response this screen reads. */
type RouterResponse = {
  rail: "cctp" | "chainrails" | "relay" | "paycrest";
  reason: string;
  alternatives: string[];
  quote:
    | {
        rail: "cctp";
        fees: { finalityThreshold: number; minimumFee: number }[];
      }
    | null;
  quoteEndpoint: string | null;
};

const RAIL_LABEL: Record<RouterResponse["rail"], string> = {
  cctp: "CCTP",
  chainrails: "Chainrails",
  relay: "Relay",
  paycrest: "Paycrest",
};

/** Rough arrival estimates per rail — refined once the rail is quoted. */
const RAIL_ETA: Record<RouterResponse["rail"], string> = {
  cctp: "≈ 1 min",
  chainrails: "≈ 1–3 min",
  relay: "≈ 30 s",
  paycrest: "≈ 2 min",
};

/** "base-sepolia" → "Base Sepolia". */
function prettyChain(id: string | null): string {
  if (!id) return "—";
  return id
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function looksLikePhone(s: string): boolean {
  return /^\+?\d[\d\s-]{6,}$/.test(s.trim());
}


/**
 * Router + quote half of the pipeline used by the guided flows (CashoutFlow,
 * BuyFlow). Takes a fully-formed IntentResponse and returns a Quote or a
 * ParseError.
 */
export async function quoteFromIntent(
  intent: IntentResponse
): Promise<ParseResult> {
  let routed: RouterResponse;
  try {
    const res = await fetch("/api/router", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: intent.action,
        fromChain:
          intent.fromChain ??
          (intent.action === "onramp" ? intent.toChain ?? "base" : undefined),
        fromToken:
          intent.fromToken ??
          (intent.action === "onramp" ? "USDC" : undefined),
        amount: intent.fromAmount,
        toChain:
          intent.toChain ??
          (intent.action === "onramp" ? "base" : undefined),
        toToken:
          intent.toToken ??
          (intent.action === "onramp" ? "USDC" : undefined),
        fiatCurrency: intent.fiatCurrency ?? undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return {
        error: "No route available",
        reason: data?.error || `Router error (${res.status}).`,
      };
    }
    routed = data as RouterResponse;
  } catch {
    return {
      error: "Network error",
      reason: "Couldn't reach the rail router — check your connection.",
    };
  }

  return buildQuote(intent, routed);
}

/** Maps a parsed intent + rail decision onto the editable Quote shape. */
function buildQuote(intent: IntentResponse, routed: RouterResponse): Quote {
  const amount = Number(intent.fromAmount) || 0;
  const fromToken = intent.fromToken || "USDC";
  const isOfframp = intent.action === "offramp";
  const isOnramp = intent.action === "onramp";
  const recipient = intent.recipient || "";
  const toChain =
    intent.toChain ?? (isOnramp ? "base" : null);
  const toToken = intent.toToken ?? (isOnramp ? "USDC" : null);

  // CCTP fast-transfer fee, when the router quoted it inline.
  let railFee = "—";
  let total = "Quoted at next step";
  if (routed.quote && routed.quote.rail === "cctp") {
    const fast = routed.quote.fees.find((f) => f.finalityThreshold === 1000);
    if (fast) {
      const usdc = (amount * fast.minimumFee) / 10_000;
      railFee = `${usdc.toFixed(4)} USDC`;
      total = railFee;
    }
  }

  const to = isOfframp
    ? {
        kind: looksLikePhone(recipient) ? "Mobile money" : "Bank account",
        currency: intent.fiatCurrency || "—",
        amount: `Paid out in ${intent.fiatCurrency || "fiat"}`,
        label: "Bank / mobile money",
        sub: recipient || "—",
      }
    : isOnramp
      ? {
          kind: "Wallet",
          currency: toToken || "USDC",
          amount:
            fromToken === "USDC" || fromToken === "USDT"
              ? `${amount.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${fromToken}`
              : `≈ ${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${toToken || "USDC"}`,
          label: prettyChain(toChain),
          sub: recipient || "Your connected wallet",
        }
      : {
          kind: intent.action === "swap" ? "Wallet" : "Chain",
          currency: toToken || fromToken,
          amount: `${amount.toLocaleString("en-US", {
            maximumFractionDigits: 4,
          })} ${toToken || fromToken}`,
          label: prettyChain(toChain),
          sub: recipient || "Your connected wallet",
        };

  const railStages = isOfframp
    ? ["Deposit", "Settle", "Payout"]
    : isOnramp
      ? ["Order", "Deposit fiat", "Receive crypto"]
      : routed.rail === "cctp"
      ? ["Lock", "Confirm", "Release"]
      : intent.action === "swap"
        ? ["Deposit", "Swap", "Receive"]
        : ["Deposit", "Bridge", "Receive"];

  return {
    from: isOnramp
      ? {
          token: intent.fiatCurrency || "FIAT",
          chain: "Local fiat",
          amount,
        }
      : {
          token: fromToken,
          chain: prettyChain(intent.fromChain),
          amount,
        },
    to,
    rate: null,
    fee: { network: "—", rail: railFee, spread: "—", total },
    eta: RAIL_ETA[routed.rail],
    rail: railStages,
    kind: isOfframp || isOnramp ? "fiat" : "crosschain",
    railName: RAIL_LABEL[routed.rail],
    railReason: routed.reason,
    exec: {
      rail: routed.rail,
      action: intent.action === "unclear" ? "bridge" : intent.action,
      fromChain: (intent.fromChain ??
        toChain ??
        "base") as ChainId,
      fromToken: fromToken as TokenSymbol,
      fromAmount: intent.fromAmount || "0",
      toChain: (toChain as ChainId | null) ?? null,
      toToken: (toToken as TokenSymbol | null) ?? null,
      fiatCurrency: intent.fiatCurrency,
      recipient: intent.recipient,
    },
  };
}

/* ───────── Send root (conversational describe flow) ───────── */
export function SendScreen({
  onHandoff,
}: {
  onHandoff: (handoff: AssistantHandoff) => void;
}) {
  return (
    <div className="col gap-6">
      <header style={{ marginBottom: 4 }}>
        <h1
          style={{
            fontSize: 30,
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            fontWeight: 500,
          }}
        >
          Describe it
        </h1>
        <span className="muted" style={{ fontSize: 14, marginTop: 2 }}>
          Chat with the assistant — we&apos;ll route you to the right flow.
        </span>
      </header>
      <AssistantChat onHandoff={onHandoff} />
    </div>
  );
}

function FeeRow({
  label,
  value,
  hint,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: string | null;
}) {
  return (
    <div className="row between center">
      <span style={{ color: "var(--fg-soft)" }}>{label}</span>
      <span className="row center gap-3">
        {hint && (
          <span className="muted font-mono" style={{ fontSize: 11 }}>
            {hint}
          </span>
        )}
        <span className="font-mono tabular" style={{ color: "var(--fg)" }}>
          {value}
        </span>
      </span>
    </div>
  );
}

/* ───────── REVIEW (pre-sign confirmation) ───────── */
export function ReviewScreen({
  quote,
  text,
  onBack,
  onConfirm,
  initialPayout,
  onPayoutChange,
}: {
  quote: Quote;
  text: string;
  onBack: () => void;
  onConfirm: (payout: PayoutDetails | null) => void;
  /** Restored after refresh when the guided flow draft includes payout fields. */
  initialPayout?: PayoutDetails;
  onPayoutChange?: (payout: PayoutDetails) => void;
}) {
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();

  // Paycrest fiat legs need structured bank / mobile-money details.
  const isOfframp = quote.exec.action === "offramp";
  const isOnramp =
    quote.exec.action === "onramp" && quote.exec.rail === "paycrest";
  const needsAccountDetails = isOfframp || isOnramp;
  const [payout, setPayout] = useState<PayoutDetails>(
    initialPayout ?? {
      institution: "",
      institutionName: "",
      accountIdentifier: quote.exec.recipient ?? "",
      accountName: "",
    }
  );
  const setPayoutAndPersist = (next: PayoutDetails) => {
    setPayout(next);
    onPayoutChange?.(next);
  };
  const payoutReady =
    !needsAccountDetails ||
    (!!payout.institution &&
      !!payout.accountIdentifier.trim() &&
      !!payout.accountName.trim());

  // Every rail needs a connected wallet — Paycrest signs the on-chain
  // transfer that funds the order; the others sign the source-chain tx.
  const needsWallet = true;
  const walletReady = isConnected || !needsWallet;
  const canConfirm = walletReady && payoutReady;

  // Once the account name resolves, show the confirmed recipient in the
  // headline instead of the raw account number / placeholder.
  const recipientLine =
    needsAccountDetails && payout.accountName
      ? `${payout.accountName}${payout.institutionName ? ` · ${payout.institutionName}` : ""}`
      : `${quote.to.label} · ${quote.to.sub}`;
  return (
    <div className="col gap-6">
      <header className="row between center wrap" style={{ gap: 16 }}>
        <div>
          <button
            className="btn btn-quiet btn-sm"
            onClick={onBack}
            style={{ padding: "0 8px", marginBottom: 6 }}
          >
            <Icon.Arrow rotate={180} size={12} /> Back to edit
          </button>
          <h1
            style={{
              fontSize: 30,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              fontWeight: 500,
            }}
          >
            Review &amp; confirm
          </h1>
          <span className="muted" style={{ fontSize: 14 }}>
            {text}
          </span>
        </div>
        <span className="chip chip-accent">
          <span className="font-mono" style={{ fontSize: 10 }}>
            ● Best route
          </span>
        </span>
      </header>

      <div className="card-lg" style={{ padding: 24 }}>
        {/* headline numbers */}
        <div className="row between center wrap" style={{ gap: 18 }}>
          <div className="col">
            <span className="muted" style={{ fontSize: 12 }}>
              You send
            </span>
            <span
              className="font-mono tabular"
              style={{
                fontSize: 34,
                fontWeight: 500,
                letterSpacing: "-0.015em",
              }}
            >
              {formatNumber(quote.from.amount)}{" "}
              <span style={{ color: "var(--fg-mute)" }}>
                {quote.from.token}
              </span>
            </span>
            <span
              className="muted font-mono"
              style={{ fontSize: 12, marginTop: 4 }}
            >
              {quote.from.chain}
            </span>
          </div>
          <Icon.ArrowRight size={22} />
          <div className="col" style={{ alignItems: "flex-end" }}>
            <span className="muted" style={{ fontSize: 12 }}>
              Recipient gets
            </span>
            <span
              className="font-mono tabular"
              style={{
                fontSize: 34,
                fontWeight: 500,
                color: "var(--accent)",
                letterSpacing: "-0.015em",
              }}
            >
              {quote.to.amount}
            </span>
            <span
              className="muted font-mono"
              style={{ fontSize: 12, marginTop: 4 }}
            >
              {recipientLine}
            </span>
          </div>
        </div>

        {/* Fiat legs (Paycrest on/off-ramp) skip the crypto rail stages and
            the placeholder fee table — the real numbers come from the order
            invoice. Crypto routes keep the breakdown. */}
        {!needsAccountDetails && (
          <>
        <div className="hr" style={{ margin: "22px 0" }} />

        {/* rail */}
        <div className="row between center" style={{ marginBottom: 18 }}>
          {quote.rail.map((r, i) => (
            <React.Fragment key={r}>
              <div
                className="col center"
                style={{ alignItems: "center", gap: 6, flex: 1 }}
              >
                <span
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 9,
                    background: "var(--accent-soft)",
                    color: "var(--accent)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "Geist Mono, monospace",
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 500 }}>{r}</span>
              </div>
              {i < quote.rail.length - 1 && (
                <div
                  style={{
                    flex: 0.6,
                    height: 1,
                    background: "var(--line-2)",
                  }}
                />
              )}
            </React.Fragment>
          ))}
        </div>

        <div className="hr" />

        {/* breakdown */}
        <div className="col gap-2" style={{ fontSize: 13, marginTop: 14 }}>
          <FeeRow label="Network fee" value={quote.fee.network} />
          <FeeRow label="Rail fee" value={quote.fee.rail} />
          <FeeRow
            label="FX spread"
            value={quote.fee.spread}
            hint={quote.rate}
          />
          <div className="hr" style={{ margin: "4px 0" }} />
          <FeeRow
            label={<strong style={{ fontWeight: 500 }}>Total fee</strong>}
            value={
              <strong className="font-mono tabular" style={{ fontWeight: 500 }}>
                {quote.fee.total}
              </strong>
            }
          />
          <FeeRow
            label="ETA"
            value={<span className="font-mono">{quote.eta}</span>}
          />
          <FeeRow
            label="From"
            value={<span className="font-mono">{quote.from.chain}</span>}
          />
        </div>
          </>
        )}
      </div>

      {/* Paycrest bank / mobile-money details (payout or refund account). */}
      {needsAccountDetails && (
        <PayoutForm
          currency={quote.exec.fiatCurrency}
          value={payout}
          onChange={setPayoutAndPersist}
          mode={isOnramp ? "refund" : "payout"}
        />
      )}

      <button
        className="btn btn-fat"
        style={{
          background: !walletReady
            ? "var(--accent)"
            : canConfirm
              ? "var(--btn-bg)"
              : "var(--bg-sunk)",
          color: !walletReady
            ? "#fff"
            : canConfirm
              ? "var(--btn-fg)"
              : "var(--fg-faint)",
          cursor: !walletReady || canConfirm ? "pointer" : "default",
        }}
        disabled={walletReady && !canConfirm}
        onClick={
          !walletReady
            ? () => openConnectModal?.()
            : canConfirm
              ? () => onConfirm(needsAccountDetails ? payout : null)
              : undefined
        }
      >
        {!walletReady ? (
          <>
            Connect wallet to continue <Icon.ArrowRight />
          </>
        ) : !payoutReady ? (
          isOnramp
            ? "Enter refund account to continue"
            : "Enter payout details to continue"
        ) : isOnramp ? (
          <>
            Confirm and continue <Icon.ArrowRight />
          </>
        ) : (
          <>
            Confirm and sign <Icon.ArrowRight />
          </>
        )}
      </button>
      <span className="muted" style={{ fontSize: 12, textAlign: "center" }}>
        {!walletReady
          ? isOnramp
            ? "We need your wallet address as the USDC destination."
            : "We need a connected wallet to sign the source-chain transaction."
          : isOnramp
            ? "You'll pay to the account we show next; your USDC arrives in your wallet once it clears."
            : isOfframp
              ? "You'll send your USDC next — then the cash is paid out to the recipient."
              : "You'll approve the transactions in your wallet. Funds move only after that."}
      </span>
    </div>
  );
}

/* ───────── payout / refund account form (Paycrest fiat legs) ───────── */
export function PayoutForm({
  currency,
  value,
  onChange,
  mode = "payout",
  variant = "card",
}: {
  currency: string | null;
  value: PayoutDetails;
  onChange: (next: PayoutDetails) => void;
  mode?: "payout" | "refund";
  /** "embedded" drops the outer card + header for use inside another panel. */
  variant?: "card" | "embedded";
}) {
  const [institutions, setInstitutions] = useState<
    { name: string; code: string; type: string }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Account-name verification: resolve the holder's name from the
  // institution + account number so the user confirms rather than types it.
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  useEffect(() => {
    if (!currency) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetch(`/api/paycrest/institutions?currency=${encodeURIComponent(currency)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
        if (!cancelled) setInstitutions(data.institutions ?? []);
      })
      .catch((err) => {
        if (!cancelled)
          setLoadError(
            err instanceof Error ? err.message : "Couldn't load institutions."
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currency]);

  const { institution, accountIdentifier } = value;
  const acct = accountIdentifier.trim();

  // Debounced verify whenever institution + account number are both set.
  useEffect(() => {
    if (!institution || acct.length < 6) {
      setVerifying(false);
      setVerifyError(null);
      if (value.accountName) onChange({ ...value, accountName: "" });
      return;
    }
    let cancelled = false;
    setVerifying(true);
    setVerifyError(null);
    const id = setTimeout(async () => {
      try {
        const res = await fetch("/api/paycrest/verify-account", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ institution, accountIdentifier: acct }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data?.accountName) {
          setVerifyError(data?.error || "Couldn't verify this account.");
          onChange({ ...value, accountName: "" });
        } else {
          onChange({ ...value, accountName: data.accountName });
        }
      } catch {
        if (!cancelled) {
          setVerifyError("Couldn't reach the verification service.");
          onChange({ ...value, accountName: "" });
        }
      } finally {
        if (!cancelled) setVerifying(false);
      }
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
    // value.accountName is intentionally excluded — we set it here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [institution, acct]);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "11px 12px",
    background: "var(--bg-soft)",
    border: "1px solid var(--line)",
    borderRadius: 10,
    color: "var(--fg)",
    fontSize: 14,
    outline: "none",
  };

  const fields = (
    <div className="col gap-3">
      <label className="col gap-1">
        <span className="font-mono" style={{ fontSize: 10, letterSpacing: 0.06, color: "var(--fg-mute)", textTransform: "uppercase" }}>
          Bank name
        </span>
        <select
          value={value.institution}
          disabled={loading || !!loadError}
          onChange={(e) => {
            const code = e.target.value;
            const inst = institutions.find((i) => i.code === code);
            onChange({
              ...value,
              institution: code,
              institutionName: inst?.name ?? "",
            });
          }}
          style={{ ...inputStyle, cursor: loading ? "wait" : "pointer" }}
        >
          <option value="">
            {loading
              ? "Loading banks…"
              : loadError
                ? "Couldn't load banks"
                : "Select your bank"}
          </option>
          {institutions.map((i) => (
            <option key={i.code} value={i.code}>
              {i.name}
              {i.type === "mobile_money" ? " (mobile money)" : ""}
            </option>
          ))}
        </select>
        {loadError && (
          <span style={{ fontSize: 12, color: "var(--err)" }}>{loadError}</span>
        )}
      </label>

      <label className="col gap-1">
        <span className="font-mono" style={{ fontSize: 10, letterSpacing: 0.06, color: "var(--fg-mute)", textTransform: "uppercase" }}>
          Account / phone number
        </span>
        <input
          value={value.accountIdentifier}
          onChange={(e) =>
            onChange({ ...value, accountIdentifier: e.target.value })
          }
          placeholder="e.g. 8170106043"
          inputMode="numeric"
          style={inputStyle}
        />
      </label>

      {/* Resolved account name — confirm, not type. */}
      {value.institution && acct.length >= 6 && (
        <AccountNameStatus
          verifying={verifying}
          error={verifyError}
          name={value.accountName}
        />
      )}
    </div>
  );

  // Embedded: the host panel supplies its own card + heading.
  if (variant === "embedded") return fields;

  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="row between center" style={{ marginBottom: 14 }}>
        <span className="row center gap-1">
          <span className="eyebrow">
            {mode === "refund" ? "Refund account" : "Payout details"}
          </span>
          <InfoHint
            text={
              mode === "refund"
                ? `If this purchase can't be completed, your ${currency ? currencyLabel(currency) : "money"} is refunded to this account. Use a ${currency ? currencyLabel(currency) : "local"} account you control — ideally the one you're paying from.`
                : `The bank or mobile-money account that receives the ${currency ? currencyLabel(currency) : "cash"} payout.`
            }
          />
        </span>
        <span className="font-mono" style={{ fontSize: 11, color: "var(--fg-mute)" }}>
          {currency
            ? mode === "refund"
              ? `Refunds in ${currencyLabel(currency)}`
              : `Paid out in ${currencyLabel(currency)}`
            : "—"}
        </span>
      </div>

      {fields}
    </div>
  );
}

/** Small clickable "(i)" with a popover — explains a field on tap/click. */
function InfoHint({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        aria-label="What's this?"
        style={{
          width: 16,
          height: 16,
          padding: 0,
          border: 0,
          background: "transparent",
          color: open ? "var(--accent)" : "var(--fg-mute)",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" strokeLinecap="round" />
          <path d="M12 8h.01" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <span
          style={{
            position: "absolute",
            top: "150%",
            left: 0,
            zIndex: 30,
            width: 230,
            padding: "10px 12px",
            background: "var(--bg-elev)",
            border: "1px solid var(--line-2)",
            borderRadius: 10,
            boxShadow: "var(--shadow-2)",
            fontSize: 12,
            lineHeight: 1.5,
            fontWeight: 400,
            letterSpacing: 0,
            textTransform: "none",
            color: "var(--fg-soft)",
            fontFamily: "inherit",
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

function AccountNameStatus({
  verifying,
  error,
  name,
}: {
  verifying: boolean;
  error: string | null;
  name: string;
}) {
  if (verifying) {
    return (
      <div
        className="row center gap-2"
        style={{
          padding: "11px 12px",
          background: "var(--bg-soft)",
          border: "1px solid var(--line)",
          borderRadius: 10,
          fontSize: 13,
          color: "var(--fg-soft)",
        }}
      >
        <Icon.Spinner size={13} /> Checking account…
      </div>
    );
  }
  if (error) {
    return (
      <div
        style={{
          padding: "11px 12px",
          background: "var(--err-soft)",
          border: "1px solid var(--err)",
          borderRadius: 10,
          fontSize: 13,
          color: "var(--fg-soft)",
        }}
      >
        {error} — check the number and institution.
      </div>
    );
  }
  if (name) {
    return (
      <div
        className="row center gap-2"
        style={{
          padding: "11px 12px",
          background: "var(--ok-soft)",
          border: "1px solid var(--ok)",
          borderRadius: 10,
        }}
      >
        <span
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: "var(--ok)",
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "0 0 20px",
          }}
        >
          <Icon.Check size={11} />
        </span>
        <div className="col" style={{ gap: 1 }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>{titleCase(name)}</span>
          <span className="muted" style={{ fontSize: 11 }}>
            Confirm this is the right recipient.
          </span>
        </div>
      </div>
    );
  }
  return null;
}

/* ───────── STATUS — real rail execution ───────── */

/**
 * One row in the timeline. `ref` is filled in once the underlying rail
 * produces a real reference (tx hash, attestation id, order id, …) and
 * `refHref` is the explorer link, when we can build one.
 */
type StageRow = { l: string; d: string; ref?: string; refHref?: string };

/** Block explorer URL for an EVM tx, or null if the chain has none. */
function explorerTxUrl(chainId: ChainId, txHash: string): string | null {
  const base = getChain(chainId)?.explorer;
  return base ? `${base}/tx/${txHash}` : null;
}

function short0x(hash: string): string {
  if (!hash.startsWith("0x") || hash.length < 14) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

/**
 * Maps a CctpStatus to an index into the CCTP stage list and produces
 * per-row description + ref strings from the real hook state.
 */
function cctpStages(
  status: CctpStatus,
  burnTxHash: string | null,
  receiveTxHash: string | null,
  fromChain: ChainId,
  toChain: ChainId
): { stages: StageRow[]; activeIndex: number; done: boolean } {
  const srcName = getChain(fromChain)?.name ?? fromChain;
  const dstName = getChain(toChain)?.name ?? toChain;
  const stages: StageRow[] = [
    {
      l: "Approve transfer",
      d: `Allowing the transfer on ${srcName}.`,
    },
    {
      l: `Lock on ${srcName}`,
      d: "Securing your funds so they can be released on the other side.",
      ref: burnTxHash ? `tx ${short0x(burnTxHash)}` : undefined,
      refHref: burnTxHash
        ? explorerTxUrl(fromChain, burnTxHash) ?? undefined
        : undefined,
    },
    {
      l: "Confirm transfer",
      d: "Confirming on both chains. Usually about 30 seconds.",
    },
    {
      l: "Switch to destination",
      d: `Switching your wallet to ${dstName}.`,
    },
    {
      l: `Release on ${dstName}`,
      d: "Delivering the funds to the recipient.",
      ref: receiveTxHash ? `tx ${short0x(receiveTxHash)}` : undefined,
      refHref: receiveTxHash
        ? explorerTxUrl(toChain, receiveTxHash) ?? undefined
        : undefined,
    },
  ];

  const indexFor: Record<CctpStatus, number> = {
    idle: -1,
    approving: 0,
    burning: 1,
    attesting: 2,
    switching: 3,
    receiving: 4,
    complete: 5,
    error: -1,
  };

  return {
    stages,
    activeIndex: indexFor[status],
    done: status === "complete",
  };
}

/**
 * Maps a PaycrestOfframpStatus to the off-ramp stage list + active index,
 * filling per-row refs (order id, funding tx) from the live hook state.
 */
function paycrestOnrampStages(
  status: PaycrestOnrampStatus,
  orderId: string | null,
  depositLabel: string | null,
  toChain: ChainId | null,
  token: string | null
): { stages: StageRow[]; activeIndex: number; done: boolean } {
  const dstName = toChain ? (getChain(toChain)?.name ?? toChain) : "chain";
  const stages: StageRow[] = [
    {
      l: "Rate locked",
      d: "We've reserved an account for your deposit.",
      ref: orderId ? `order ${orderId.slice(0, 8)}…` : undefined,
    },
    {
      l: "Send your payment",
      d: "Transfer the exact amount to the account shown below.",
      ref: depositLabel ?? undefined,
    },
    {
      l: "Confirming your payment",
      d: `Once it lands, your ${token ?? "USDC"} is on the way.`,
    },
    {
      l: "Received",
      d: `${token ?? "USDC"} delivered on ${dstName}.`,
    },
  ];

  const indexFor: Record<PaycrestOnrampStatus, number> = {
    idle: -1,
    creating: 0,
    awaiting_deposit: 1,
    settling: 2,
    complete: 4,
    error: -1,
  };

  return {
    stages,
    activeIndex: indexFor[status],
    done: status === "complete",
  };
}

/**
 * A single, honest off-ramp phase derived from the hook status + live order.
 * The UI's header, step list, and funding panel all read from this one value
 * so they can never disagree.
 */
type OfframpPhase =
  | "creating"
  | "awaiting-funds"
  | "sending"
  | "confirming"
  | "partial"
  | "converting"
  | "settled"
  | "expired"
  | "refunded";

/**
 * `sent` = we know the deposit went out on-chain (this session or a remembered
 * one). It lets us say "Confirming your deposit" instead of "Waiting…" even
 * while Paycrest's order still reads `initiated` (its indexer lags the chain).
 */
function offrampPhase(
  status: PaycrestOfframpStatus,
  order: PaycrestOrder | null,
  sent: boolean
): OfframpPhase {
  if (!order) return "creating";
  if (order.status === "settled" || order.status === "fulfilled" || status === "complete")
    return "settled";
  if (order.status === "refunded") return "refunded";
  if (order.status === "expired") return "expired";
  const paid = Number(order.amountPaid ?? 0);
  const amt = Number(order.amount ?? 0);
  if (paid > 0 && amt > 0 && paid < amt) return "partial";
  // Paycrest has actually credited / is processing the deposit.
  if (order.status === "processing" || order.status === "pending" || paid > 0) {
    return "converting";
  }
  if (status === "funding") return "sending";
  // We sent it, but Paycrest hasn't credited yet — honestly "confirming".
  if (sent || status === "settling") return "confirming";
  return "awaiting-funds";
}

/** Honest, jargon-free headline per off-ramp phase. */
function offrampHeadline(
  phase: OfframpPhase,
  sendLabel: string,
  fiatLabel: string | null,
  fiatCode: string,
  recipient: string | null
): string {
  switch (phase) {
    case "creating":
      return "Getting your rate…";
    case "awaiting-funds":
      return `Waiting for your ${sendLabel}`;
    case "sending":
      return "Sending from your wallet…";
    case "confirming":
      return "Confirming your deposit";
    case "partial":
      return "Waiting for the rest of your deposit";
    case "converting":
      return `Converting to ${fiatCode}`;
    case "settled":
      return recipient
        ? `${fiatLabel ?? fiatCode} sent to ${recipient}`
        : `${fiatLabel ?? fiatCode} sent`;
    case "expired":
      return "Rate expired";
    case "refunded":
      return "Order refunded";
  }
}

function paycrestStages(
  phase: OfframpPhase,
  token: string,
  fiatLabel: string | null,
  fiatCode: string,
  recipient: string | null,
  bank: string | null,
  acct: string | null
): { stages: StageRow[]; activeIndex: number; done: boolean } {
  const received = phase === "converting" || phase === "settled";
  const confirming = phase === "confirming";
  const step2Label = received
    ? `${token} received`
    : confirming
      ? `Confirming your ${token}`
      : `Waiting for your ${token}`;
  const step2Desc = received
    ? "We've got your funds."
    : confirming
      ? "Sent on-chain — finalizing with the provider."
      : "Send the exact amount to continue.";
  const paidLine = `${fiatLabel ?? fiatCode} to ${recipient ?? "recipient"}${
    bank ? ` · ${bank}` : ""
  }${acct ? ` · ${acct}` : ""}`;
  const stages: StageRow[] = [
    { l: "Rate locked", d: "Your rate is held for this transfer." },
    { l: step2Label, d: step2Desc },
    { l: `Converting to ${fiatCode}`, d: "Almost there." },
    { l: paidLine, d: "Delivered to the recipient." },
  ];

  const indexFor: Record<OfframpPhase, number> = {
    creating: 0,
    "awaiting-funds": 1,
    sending: 1,
    confirming: 1,
    partial: 1,
    converting: 2,
    settled: 4,
    expired: 1,
    refunded: 1,
  };

  return {
    stages,
    activeIndex: indexFor[phase],
    done: phase === "settled",
  };
}

/**
 * Relay swap/bridge stages. Relay returns a dynamic step list, so we map it
 * onto three stable phases and surface the live step + tx in the middle row.
 */
function relayStages(
  status: RelaySwapStatus,
  progress: ExecutionProgress | null,
  fromChain: ChainId,
  toChain: ChainId,
  fromToken: string,
  toToken: string | null
): { stages: StageRow[]; activeIndex: number; done: boolean } {
  const srcName = getChain(fromChain)?.name ?? fromChain;
  const dstName = getChain(toChain)?.name ?? toChain;
  const stepDetail = progress
    ? `${progress.stepName} · step ${progress.currentStep} of ${progress.totalSteps}`
    : "You'll approve each step in your wallet.";
  const stages: StageRow[] = [
    {
      l: "Prepare route",
      d: `Finding the best path from ${srcName} to ${dstName}.`,
    },
    {
      l: "Confirm & send",
      d: stepDetail,
      ref: progress?.txHash ? `tx ${short0x(progress.txHash)}` : undefined,
      refHref: progress?.txLink ?? undefined,
    },
    {
      l: "Receive",
      d: `${toToken ?? fromToken} arrives on ${dstName}.`,
    },
  ];

  const indexFor: Record<RelaySwapStatus, number> = {
    idle: -1,
    quoting: 0,
    executing: 1,
    complete: 3,
    error: -1,
  };

  return {
    stages,
    activeIndex: indexFor[status],
    done: status === "complete",
  };
}

export function StatusScreen({
  intent,
  onDone,
}: {
  intent: Intent | null;
  onDone: () => void;
}) {
  const exec = intent?.quote?.exec;
  const { address, isConnected } = useAccount();
  const cctp = useCctp();
  const paycrestOfframp = usePaycrestOfframp();
  const paycrestOnramp = usePaycrestOnramp();
  const relay = useRelaySwap();

  // Local error for cases where we can't even hand off to a rail
  // (no wallet, missing chain, etc.) — distinct from the rail's own error.
  const [bootError, setBootError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmNav, setConfirmNav] = useState(false);
  const [exactWarn, setExactWarn] = useState(false);
  const [showManual, setShowManual] = useState(false);

  // Kick off execution exactly once per intent. `runNonce` lets Retry /
  // "Get new rate" force a fresh run without changing the intent.
  const startedFor = useRef<string | null>(null);
  const [runNonce, setRunNonce] = useState(0);
  useEffect(() => {
    if (!exec || !intent) return;
    // Identify a run by the intent text + rail; lets a "Send another"
    // round-trip start a fresh execution.
    const runKey = `${intent.text}|${exec.rail}|${exec.fromChain}|${exec.toChain}|${exec.fromAmount}|${runNonce}`;
    if (startedFor.current === runKey) return;
    startedFor.current = runKey;

    setBootError(null);
    cctp.reset();
    paycrestOfframp.reset();
    paycrestOnramp.reset();
    relay.reset();

    if (!isConnected || !address) {
      setBootError(
        "Connect a wallet first — the source-chain transaction needs to be signed by the sender."
      );
      return;
    }

    // --- Paycrest fiat legs ------------------------------------------------
    if (exec.rail === "paycrest") {
      if (exec.action === "offramp") {
        // Resuming an existing order from History — adopt it, don't recreate.
        if (intent.resumeOrderId) {
          paycrestOfframp
            .resume({
              orderId: intent.resumeOrderId,
              fromChain: exec.fromChain,
              token: exec.fromToken as PaycrestToken,
            })
            .catch(() => {});
          return;
        }
        if (!exec.fiatCurrency) {
          setBootError(
            "We couldn't determine a payout currency — try rephrasing."
          );
          return;
        }
        if (
          !exec.payout?.institution ||
          !exec.payout.accountIdentifier ||
          !exec.payout.accountName
        ) {
          setBootError("Payout details are missing — go back and add them.");
          return;
        }

        paycrestOfframp
          .offramp({
            fromChain: exec.fromChain,
            token: exec.fromToken as PaycrestToken,
            amount: exec.fromAmount,
            fiatCurrency: exec.fiatCurrency as PaycrestFiat,
            recipient: {
              institution: exec.payout.institution,
              accountIdentifier: exec.payout.accountIdentifier,
              accountName: exec.payout.accountName,
            },
            reference: `swap-chain-offramp-${Date.now()}`,
          })
          .catch(() => {});
        return;
      }

      if (exec.action === "onramp") {
        if (!exec.fiatCurrency) {
          setBootError(
            "We couldn't determine the fiat currency — try rephrasing."
          );
          return;
        }
        if (!exec.toChain) {
          setBootError("We couldn't determine a destination chain.");
          return;
        }
        if (
          !exec.payout?.institution ||
          !exec.payout.accountIdentifier ||
          !exec.payout.accountName
        ) {
          setBootError("Refund account details are missing — go back and add them.");
          return;
        }

        const amountIn =
          exec.fromToken === "USDC" || exec.fromToken === "USDT"
            ? "crypto"
            : "fiat";

        paycrestOnramp
          .onramp({
            toChain: exec.toChain,
            token: (exec.toToken ?? "USDC") as PaycrestToken,
            amount: exec.fromAmount,
            amountIn,
            fiatCurrency: exec.fiatCurrency as PaycrestFiat,
            refundAccount: {
              institution: exec.payout.institution,
              accountIdentifier: exec.payout.accountIdentifier,
              accountName: exec.payout.accountName,
            },
            recipientAddress: address,
            reference: `swap-chain-onramp-${Date.now()}`,
          })
          .catch(() => {});
        return;
      }

      setBootError("This Paycrest action isn't supported yet.");
      return;
    }

    // --- Relay swap / non-USDC bridge -------------------------------------
    if (exec.rail === "relay") {
      if (!exec.toChain) {
        setBootError(
          "We couldn't determine a destination chain from your request — try rephrasing."
        );
        return;
      }
      relay
        .swap({
          fromChain: exec.fromChain,
          toChain: exec.toChain,
          fromToken: exec.fromToken,
          toToken: exec.toToken ?? exec.fromToken,
          amount: exec.fromAmount,
          recipient: exec.recipient,
        })
        .catch(() => {
          // The hook exposes the error via relay.error — no rethrow.
        });
      return;
    }

    // --- CCTP bridge -------------------------------------------------------
    if (exec.rail !== "cctp") {
      setBootError(
        "This route isn't ready for signing yet — we're rolling it out soon. " +
          "The amount and fees you see above are accurate."
      );
      return;
    }

    if (!exec.toChain) {
      setBootError(
        "We couldn't determine a destination chain from your request — try rephrasing."
      );
      return;
    }

    let amount: bigint;
    try {
      amount = parseUnits(exec.fromAmount, 6); // USDC = 6 decimals
    } catch {
      setBootError(`Couldn't parse the amount "${exec.fromAmount}".`);
      return;
    }
    if (amount <= 0n) {
      setBootError("Amount must be greater than zero.");
      return;
    }

    const recipient =
      exec.recipient && /^0x[a-fA-F0-9]{40}$/.test(exec.recipient)
        ? (exec.recipient as `0x${string}`)
        : address;

    cctp
      .bridge({
        srcChain: exec.fromChain,
        dstChain: exec.toChain,
        amount,
        recipient,
      })
      .catch(() => {
        // The hook already exposes the error via cctp.error — no rethrow.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, isConnected, address, runNonce]);

  const restart = () => {
    startedFor.current = null;
    cctp.reset();
    paycrestOfframp.reset();
    paycrestOnramp.reset();
    relay.reset();
    setBootError(null);
    setRunNonce((n) => n + 1);
  };

  // ----- Off-ramp (cash-out) presentation state -----------------------------
  const isOfframpRail = exec?.rail === "paycrest" && exec.action !== "onramp";
  const offrampOrder = isOfframpRail ? paycrestOfframp.order : null;
  // We know the deposit was sent if we have its tx (this session or a
  // remembered/resumed one) or Paycrest already shows some credited.
  const depositSent =
    !!paycrestOfframp.transferTxHash ||
    (offrampOrder ? Number(offrampOrder.amountPaid ?? 0) > 0 : false);
  const offrampPhaseValue: OfframpPhase | null = isOfframpRail
    ? offrampPhase(paycrestOfframp.status, offrampOrder, depositSent)
    : null;
  const offrampFunding = paycrestOfframp.status === "funding";

  // Recipient (title-cased) + amounts, derived from the order/exec.
  const payoutName = exec?.payout?.accountName
    ? titleCase(exec.payout.accountName)
    : null;
  const payoutBank = exec?.payout?.institutionName ?? null;
  const payoutAcct = exec?.payout?.accountIdentifier ?? null;
  const sendLabel = offrampOrder
    ? formatToken(offrampOrder.amount, exec?.fromToken ?? "")
    : "";
  const fiatReceive =
    offrampOrder?.rate && offrampOrder.amount
      ? Number(offrampOrder.amount) * Number(offrampOrder.rate)
      : null;
  const fiatReceiveLabel =
    fiatReceive !== null && exec?.fiatCurrency
      ? formatFiat(exec.fiatCurrency, fiatReceive)
      : null;

  // Wallet balance of the token being sent → drives the funding branch.
  const balance = useTokenBalance(exec?.fromToken, exec?.fromChain);
  const sendAmountNum = offrampOrder ? Number(offrampOrder.amount) : 0;
  const hasBalance =
    balance.formatted !== undefined &&
    sendAmountNum > 0 &&
    Number(balance.formatted) >= sendAmountNum;
  const offrampPaid = Number(offrampOrder?.amountPaid ?? 0);

  // Only the senderFee (SwapChain's own markup) actually reduces the user's
  // payout. Paycrest's protocol transactionFee is absorbed in the provider's
  // settlement — the recipient gets the full amount × rate — so we don't show
  // it as a user-facing fee.
  const senderFeeNum = Number(offrampOrder?.senderFee ?? 0);
  const feeLine = offrampOrder?.rate
    ? senderFeeNum > 0
      ? `Rate ${offrampOrder.rate} · fee ${formatToken(senderFeeNum, exec?.fromToken ?? "", 2)}`
      : `Rate ${offrampOrder.rate}`
    : null;

  // Funding panel shows only while still waiting on the deposit.
  const showFunding =
    isOfframpRail &&
    !!offrampOrder?.receiveAddress &&
    (offrampPhaseValue === "awaiting-funds" ||
      offrampPhaseValue === "sending" ||
      offrampPhaseValue === "partial");

  // Resolve stage list + active index from the rail.
  const view =
    exec?.rail === "cctp" && exec.toChain
      ? cctpStages(
          cctp.status,
          cctp.burnTxHash,
          cctp.receiveTxHash,
          exec.fromChain,
          exec.toChain
        )
      : exec?.rail === "paycrest" && exec.action === "onramp"
        ? paycrestOnrampStages(
            paycrestOnramp.status,
            paycrestOnramp.order?.id ?? null,
            paycrestOnramp.order?.depositAccountIdentifier
              ? `${paycrestOnramp.order.amountToTransfer ?? ""} ${paycrestOnramp.order.depositCurrency ?? ""} → ${paycrestOnramp.order.depositAccountIdentifier}`
              : null,
            exec.toChain,
            exec.toToken
          )
        : exec?.rail === "paycrest"
          ? paycrestStages(
              offrampPhaseValue ?? "creating",
              exec.fromToken,
              fiatReceiveLabel,
              exec.fiatCurrency ?? "",
              payoutName,
              payoutBank,
              payoutAcct
            )
          : exec?.rail === "relay" && exec.toChain
            ? relayStages(
                relay.status,
                relay.progress,
                exec.fromChain,
                exec.toChain,
                exec.fromToken,
                exec.toToken
              )
            : { stages: [], activeIndex: -1, done: false };

  const stages = view.stages;
  const activeIndex = view.activeIndex;
  const done = view.done;
  const railError =
    exec?.rail === "cctp"
      ? cctp.error
      : exec?.rail === "paycrest" && exec.action === "onramp"
        ? paycrestOnramp.error
        : exec?.rail === "paycrest"
          ? paycrestOfframp.error
          : exec?.rail === "relay"
            ? relay.error
            : null;

  const onrampOrder =
    exec?.rail === "paycrest" && exec.action === "onramp"
      ? paycrestOnramp.order
      : null;

  // Countdown to the rate's expiry (off-ramp orders hold a rate ~60 min).
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const expiryMs = offrampOrder?.validUntil
    ? new Date(offrampOrder.validUntil).getTime()
    : null;
  const remainingMs = expiryMs !== null ? expiryMs - now : null;
  // Once the deposit is sent the on-chain order locks the rate, so the
  // countdown is moot — hide it rather than scaring the user with 00:00.
  const countdown =
    remainingMs !== null && !depositSent ? formatCountdown(remainingMs) : null;
  const expiringSoon =
    !depositSent &&
    remainingMs !== null &&
    remainingMs > 0 &&
    remainingMs < 5 * 60 * 1000;
  // Only a window that lapsed WITHOUT a deposit is a real expiry.
  const timedOut =
    !depositSent &&
    remainingMs !== null &&
    remainingMs <= 0 &&
    (offrampPhaseValue === "awaiting-funds" || offrampPhaseValue === "partial");
  const apiExpired = offrampPhaseValue === "expired";
  const isExpired = apiExpired || timedOut;
  // Paycrest reports expired but we know it was paid → don't offer "Get new
  // rate" (double-send risk); the deposit is on-chain. Point to support.
  const stuckAfterPaid = apiExpired && depositSent;

  const headline =
    railError || bootError
      ? "Stalled."
      : isOfframpRail && offrampPhaseValue
        ? offrampHeadline(
            isExpired ? "expired" : offrampPhaseValue,
            sendLabel,
            fiatReceiveLabel,
            exec?.fiatCurrency ?? "",
            payoutName
          )
        : done
          ? "Sent."
          : cctp.status === "idle"
            ? "Starting…"
            : "Sending…";

  const copyDepositAddress = () => {
    const addr = offrampOrder?.receiveAddress;
    if (!addr) return;
    navigator.clipboard
      ?.writeText(addr)
      .then(() => {
        setCopied(true);
        setExactWarn(true);
        setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => {});
  };

  return (
    <div className="col gap-6">
      <header className="row between center wrap" style={{ gap: 16 }}>
        <div>
          <span className="eyebrow">Status</span>
          <h1
            style={{
              fontSize: 30,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              marginTop: 6,
              fontWeight: 500,
            }}
          >
            {headline}
          </h1>
          <span className="muted" style={{ fontSize: 14 }}>
            {intent?.text}
          </span>
        </div>
        <div className="row center gap-2">
          {isOfframpRail && isExpired ? (
            <span className="chip chip-err">Rate expired</span>
          ) : isOfframpRail && countdown ? (
            <span className={"chip" + (expiringSoon ? " chip-pend" : "")}>
              Rate locked ·{" "}
              <span className="font-mono tabular">{countdown}</span>
            </span>
          ) : null}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => (showFunding ? setConfirmNav(true) : onDone())}
          >
            New send
          </button>
        </div>
      </header>

      <div className="card" style={{ padding: 22 }}>
        {/* summary */}
        <div
          className="row between center wrap"
          style={{ gap: 16, marginBottom: 18 }}
        >
          <div className="col">
            <span className="muted" style={{ fontSize: 12 }}>
              You {done ? "paid" : "pay"}
            </span>
            <span
              className="font-mono tabular"
              style={{ fontSize: 22, fontWeight: 500 }}
            >
              {formatNumber(intent?.quote?.from?.amount ?? 0)}{" "}
              {intent?.quote?.from?.token}
            </span>
          </div>
          {!isOfframpRail && <Icon.ArrowRight />}
          <div className="col" style={{ alignItems: "flex-end" }}>
            <span className="muted" style={{ fontSize: 12 }}>
              Recipient gets
            </span>
            <span
              className="font-mono tabular"
              style={{
                fontSize: 22,
                fontWeight: 500,
                color: done ? "var(--ok)" : "var(--accent)",
              }}
            >
              {fiatReceiveLabel ?? intent?.quote?.to?.amount}
            </span>
            {feeLine && (
              <span
                className="muted font-mono"
                style={{ fontSize: 11, marginTop: 2 }}
              >
                {feeLine}
              </span>
            )}
          </div>
        </div>

        <div className="hr" />

        {/* Boot-time error (no wallet, no rail wired, bad amount) — */}
        {/* skips the timeline entirely because nothing actually started. */}
        {bootError && (
          <div
            className="col gap-2"
            style={{
              marginTop: 18,
              padding: "14px 16px",
              background: "var(--err-soft)",
              border: "1px solid var(--err)",
              borderRadius: 12,
            }}
          >
            <strong style={{ fontSize: 14, color: "var(--err)" }}>
              Can&apos;t execute this route yet
            </strong>
            <span style={{ fontSize: 13, color: "var(--fg-soft)" }}>
              {bootError}
            </span>
          </div>
        )}

        {onrampOrder?.depositAccountIdentifier && !bootError && (
          <div
            className="col gap-2"
            style={{
              marginTop: 18,
              padding: "14px 16px",
              background: "var(--accent-soft)",
              border: "1px solid var(--line-2)",
              borderRadius: 12,
            }}
          >
            <strong style={{ fontSize: 14 }}>Deposit instructions</strong>
            <span style={{ fontSize: 13, color: "var(--fg-soft)" }}>
              Transfer exactly{" "}
              <strong className="font-mono">
                {onrampOrder.amountToTransfer} {onrampOrder.depositCurrency}
              </strong>{" "}
              to:
            </span>
            <span className="font-mono" style={{ fontSize: 13 }}>
              {onrampOrder.depositAccountName}
            </span>
            <span className="font-mono" style={{ fontSize: 15, fontWeight: 500 }}>
              {onrampOrder.depositAccountIdentifier}
            </span>
            {onrampOrder.depositInstitution && (
              <span className="muted" style={{ fontSize: 12 }}>
                {onrampOrder.depositInstitution}
              </span>
            )}
            {onrampOrder.validUntil && (
              <span className="muted" style={{ fontSize: 12 }}>
                Deposit before {new Date(onrampOrder.validUntil).toLocaleString()}
              </span>
            )}
            {onrampOrder.amount && onrampOrder.currency && (
              <span className="muted" style={{ fontSize: 12 }}>
                You receive ≈ {onrampOrder.amount} {onrampOrder.currency}
                {onrampOrder.rate ? ` @ ${onrampOrder.rate}` : ""}
              </span>
            )}
          </div>
        )}

        {/* Off-ramp terminal states */}
        {isOfframpRail && isExpired && !bootError && (
          stuckAfterPaid ? (
            <StuckCard
              orderId={offrampOrder?.id ?? null}
              txHash={paycrestOfframp.transferTxHash}
              fromChain={exec?.fromChain ?? null}
              refundAddress={address ?? null}
            />
          ) : (
            <ExpiredCard onNewRate={restart} />
          )
        )}
        {isOfframpRail &&
          offrampPhaseValue === "refunded" &&
          !bootError && <RefundedCard refundAddress={address ?? null} />}

        {/* Off-ramp funding — branch on whether the wallet covers it. */}
        {showFunding && !isExpired && offrampOrder?.receiveAddress && !bootError && (
          <div className="col gap-4" style={{ marginTop: 18 }}>
            {/* Make the swap explicit: you send USDC, the recipient gets cash. */}
            <div
              className="col gap-1"
              style={{
                padding: 14,
                background: "var(--accent-soft)",
                border: "1px solid var(--line-2)",
                borderRadius: 12,
              }}
            >
              <strong style={{ fontSize: 15 }}>
                Send {sendLabel} to pay out {fiatReceiveLabel ?? "the cash"}
              </strong>
              <span className="muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
                {payoutName ? `${payoutName} receives it` : "The recipient is paid"}
                {payoutBank ? ` in their ${payoutBank} account` : ""}
                {payoutAcct ? ` (${payoutAcct})` : ""} the moment your{" "}
                {exec?.fromToken ?? "USDC"} arrives.
              </span>
            </div>

            {balance.formatted !== undefined && (
              <div
                className="row between center"
                style={{ fontSize: 12.5, padding: "0 2px" }}
              >
                <span className="muted">Your wallet balance</span>
                <span
                  className="font-mono tabular"
                  style={{ color: hasBalance ? "var(--fg)" : "var(--err)" }}
                >
                  {formatToken(balance.formatted, exec?.fromToken ?? "", 2)}
                </span>
              </div>
            )}

            {offrampPhaseValue === "partial" && (
              <div
                className="row center gap-2"
                style={{
                  padding: "10px 12px",
                  background: "var(--bg-soft)",
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                  fontSize: 13,
                }}
              >
                <span>
                  Received{" "}
                  <strong className="font-mono tabular">
                    {formatToken(offrampPaid, exec?.fromToken ?? "", 2)}
                  </strong>{" "}
                  of {sendLabel} — send{" "}
                  <strong className="font-mono tabular">
                    {formatToken(
                      Math.max(sendAmountNum - offrampPaid, 0),
                      exec?.fromToken ?? "",
                      2
                    )}
                  </strong>{" "}
                  more to the address below.
                </span>
              </div>
            )}

            {hasBalance ? (
              <div className="col gap-3">
                <button
                  className="btn btn-fat"
                  disabled={offrampFunding}
                  style={{
                    background: offrampFunding ? "var(--bg-sunk)" : "var(--btn-bg)",
                    color: offrampFunding ? "var(--fg-faint)" : "var(--btn-fg)",
                    cursor: offrampFunding ? "default" : "pointer",
                  }}
                  onClick={() => paycrestOfframp.fund().catch(() => {})}
                >
                  {offrampFunding ? (
                    <>
                      <Icon.Spinner size={14} /> Confirm in your wallet…
                    </>
                  ) : (
                    <>
                      Pay {sendLabel} from your wallet <Icon.ArrowRight />
                    </>
                  )}
                </button>

                {/* Organized secondary method, not a raw <details> marker. */}
                <button
                  onClick={() => setShowManual((v) => !v)}
                  className="row between center"
                  style={{
                    padding: "11px 14px",
                    background: "var(--bg-soft)",
                    border: "1px solid var(--line)",
                    borderRadius: 10,
                    cursor: "pointer",
                    color: "inherit",
                    textAlign: "left",
                  }}
                >
                  <span style={{ fontSize: 13 }}>
                    Or send from another wallet or exchange
                  </span>
                  <span
                    style={{
                      display: "inline-flex",
                      transform: showManual ? "rotate(180deg)" : "none",
                      transition: "transform .15s var(--ease)",
                      color: "var(--fg-mute)",
                    }}
                  >
                    <Icon.ChevDown size={14} />
                  </span>
                </button>
                {showManual && (
                  <DepositAddress
                    token={exec?.fromToken ?? ""}
                    chainName={intent?.quote?.from?.chain ?? ""}
                    address={offrampOrder.receiveAddress}
                    sendLabel={sendLabel}
                    refundAddress={address ?? null}
                    copied={copied}
                    onCopy={copyDepositAddress}
                  />
                )}
              </div>
            ) : (
              <div className="col gap-2">
                <DepositAddress
                  token={exec?.fromToken ?? ""}
                  chainName={intent?.quote?.from?.chain ?? ""}
                  address={offrampOrder.receiveAddress}
                  sendLabel={sendLabel}
                  refundAddress={address ?? null}
                  copied={copied}
                  onCopy={copyDepositAddress}
                />
                <span className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
                  Top up this wallet to pay in one tap, or send to the address
                  above from any wallet or exchange.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Live timeline — hidden on off-ramp terminal states (expired/refunded). */}
        {!bootError &&
          stages.length > 0 &&
          !(isOfframpRail && (isExpired || offrampPhaseValue === "refunded")) && (
          <div className="col" style={{ marginTop: 18 }}>
            {stages.map((s, i) => {
              const isDone = done || activeIndex > i;
              const isActive = !done && activeIndex === i;
              const isFailed = !!railError && activeIndex === i;
              const dim = activeIndex < i && !done ? 0.5 : 1;
              return (
                <div
                  key={i}
                  className="row"
                  style={{
                    gap: 14,
                    paddingBottom: i < stages.length - 1 ? 22 : 0,
                    alignItems: "flex-start",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      flex: "0 0 22px",
                    }}
                  >
                    <div
                      style={{
                        width: 20,
                        height: 20,
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
                    {i < stages.length - 1 && (
                      <div
                        style={{
                          width: 2,
                          flex: 1,
                          minHeight: 22,
                          background: isDone ? "var(--ok)" : "var(--line)",
                          marginTop: 4,
                        }}
                      />
                    )}
                  </div>
                  <div className="col grow gap-1" style={{ opacity: dim }}>
                    <div className="row between center">
                      <h4 style={{ fontSize: 15, fontWeight: 500 }}>{s.l}</h4>
                      <span
                        className="font-mono"
                        style={{ fontSize: 11, color: "var(--fg-mute)" }}
                      >
                        {isFailed
                          ? "failed"
                          : isDone
                            ? "done"
                            : isActive
                              ? "in progress"
                              : "pending"}
                      </span>
                    </div>
                    <span style={{ fontSize: 13, color: "var(--fg-soft)" }}>
                      {s.d}
                    </span>
                    {s.ref && (isDone || isActive) && (
                      <RailRef text={s.ref} href={s.refHref ?? null} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Rail returned an error mid-flight — show it inline, no fake fanfare. */}
        {railError && (
          <div
            className="col gap-2"
            style={{
              marginTop: 18,
              padding: "14px 16px",
              background: "var(--err-soft)",
              border: "1px solid var(--err)",
              borderRadius: 12,
            }}
          >
            <strong style={{ fontSize: 14, color: "var(--err)" }}>
              Transfer stopped
            </strong>
            <span style={{ fontSize: 13, color: "var(--fg-soft)" }}>
              {railError}
            </span>
            <div className="row gap-2" style={{ marginTop: 4 }}>
              <button className="btn btn-ghost btn-sm" onClick={restart}>
                Retry
              </button>
              <button className="btn btn-quiet btn-sm" onClick={onDone}>
                Start over
              </button>
            </div>
          </div>
        )}

        {done && (
          <div
            className="row center gap-3"
            style={{
              marginTop: 22,
              padding: "12px 16px",
              background: "var(--ok-soft)",
              borderRadius: 12,
              animation: "fade-up .35s var(--ease) both",
            }}
          >
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "var(--ok)",
                color: "#fff",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon.Check size={14} />
            </span>
            <div className="col">
              <span style={{ fontSize: 14, fontWeight: 500 }}>
                Sent {intent?.quote?.to?.amount}
              </span>
              <span className="muted" style={{ fontSize: 12 }}>
                {intent?.quote?.to?.label} · {intent?.quote?.to?.sub}
              </span>
            </div>
            <span style={{ flex: 1 }} />
            <button className="btn btn-ghost btn-sm" onClick={onDone}>
              Send another
            </button>
          </div>
        )}

        {/* Technical references, tucked away. */}
        {isOfframpRail && offrampOrder && (
          <details style={{ marginTop: 16 }}>
            <summary
              style={{ cursor: "pointer", color: "var(--fg-mute)", fontSize: 12 }}
            >
              Details
            </summary>
            <div className="col gap-1" style={{ marginTop: 8 }}>
              <span className="font-mono muted" style={{ fontSize: 11 }}>
                Order {offrampOrder.id}
              </span>
              {paycrestOfframp.transferTxHash && exec && (
                <a
                  className="font-mono"
                  style={{ fontSize: 11, color: "var(--accent)" }}
                  href={
                    explorerTxUrl(exec.fromChain, paycrestOfframp.transferTxHash) ??
                    "#"
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  Your payment {short0x(paycrestOfframp.transferTxHash)}
                </a>
              )}
              {offrampOrder.txHash && exec && (
                <a
                  className="font-mono"
                  style={{ fontSize: 11, color: "var(--accent)" }}
                  href={explorerTxUrl(exec.fromChain, offrampOrder.txHash) ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                >
                  Settlement tx {short0x(offrampOrder.txHash)}
                </a>
              )}
            </div>
          </details>
        )}
      </div>

      {exactWarn && offrampOrder?.receiveAddress && (
        <BeforeYouSendModal
          sendLabel={sendLabel}
          token={exec?.fromToken ?? ""}
          chainName={intent?.quote?.from?.chain ?? "Base"}
          address={offrampOrder.receiveAddress}
          copied={copied}
          onCopy={copyDepositAddress}
          onClose={() => setExactWarn(false)}
        />
      )}
      {confirmNav && (
        <StatusModal
          title="Active transfer waiting"
          body="You have an active transfer waiting for funds. Start a new one? You can still find this order in History."
          confirmLabel="Start new"
          onConfirm={() => {
            setConfirmNav(false);
            onDone();
          }}
          onClose={() => setConfirmNav(false)}
        />
      )}
    </div>
  );
}

/* ───────── status sub-components ───────── */

function DepositAddress({
  token,
  chainName,
  address,
  sendLabel,
  refundAddress,
  copied,
  onCopy,
}: {
  token: string;
  chainName: string;
  address: string;
  sendLabel: string;
  refundAddress: string | null;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div
      className="col gap-3"
      style={{
        padding: 14,
        background: "var(--bg-soft)",
        border: "1px solid var(--line)",
        borderRadius: 12,
      }}
    >
      <div className="row between center wrap" style={{ gap: 8 }}>
        <span className="eyebrow" style={{ fontSize: 10 }}>
          Deposit address
        </span>
        <span className="chip chip-err" style={{ fontSize: 10 }}>
          {token} on {chainName} only
        </span>
      </div>

      <button
        onClick={onCopy}
        className="row between center gap-3"
        style={{
          padding: "12px 14px",
          background: "var(--bg)",
          border: "1px solid var(--line-2)",
          borderRadius: 10,
          cursor: "pointer",
          textAlign: "left",
          color: "inherit",
        }}
        title="Copy address"
        aria-label="Copy deposit address"
      >
        <span
          className="font-mono tabular"
          style={{ fontSize: 13, wordBreak: "break-all", lineHeight: 1.4 }}
        >
          {address}
        </span>
        {copied ? (
          <span
            className="row center gap-1"
            style={{ flex: "0 0 auto", fontSize: 11, color: "var(--ok)" }}
          >
            <Icon.Check size={12} /> Copied
          </span>
        ) : (
          <Icon.Copy size={14} />
        )}
      </button>

      <span className="muted" style={{ fontSize: 11, lineHeight: 1.5 }}>
        Send exactly {sendLabel}. Exchanges may deduct fees — send enough that the
        full amount arrives.
        {refundAddress && (
          <>
            {" "}
            If the order can&apos;t complete, funds return to{" "}
            {short0x(refundAddress)}.
          </>
        )}
      </span>
    </div>
  );
}

function ExpiredCard({ onNewRate }: { onNewRate: () => void }) {
  return (
    <div
      className="col gap-2"
      style={{
        marginTop: 18,
        padding: 16,
        background: "var(--bg-soft)",
        border: "1px solid var(--line)",
        borderRadius: 12,
      }}
    >
      <strong style={{ fontSize: 14 }}>Rate expired</strong>
      <span className="muted" style={{ fontSize: 13 }}>
        This rate is no longer held. If you didn&apos;t send anything, nothing
        was charged. Get a fresh rate to continue.
      </span>
      <button
        className="btn btn-fat"
        style={{
          background: "var(--btn-bg)",
          color: "var(--btn-fg)",
          alignSelf: "flex-start",
        }}
        onClick={onNewRate}
      >
        Get new rate <Icon.ArrowRight />
      </button>
    </div>
  );
}

/** Shown when we know the deposit was paid but Paycrest reports expired —
 *  never offer a new rate (the money is already on-chain). */
function StuckCard({
  orderId,
  txHash,
  fromChain,
  refundAddress,
}: {
  orderId: string | null;
  txHash: string | null;
  fromChain: ChainId | null;
  refundAddress: string | null;
}) {
  return (
    <div
      className="col gap-2"
      style={{
        marginTop: 18,
        padding: 16,
        background: "var(--bg-soft)",
        border: "1px solid var(--line)",
        borderRadius: 12,
      }}
    >
      <strong style={{ fontSize: 14 }}>Payment received — taking longer</strong>
      <span className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
        We have your payment on-chain, but the payout is taking longer than
        usual to confirm. Don&apos;t send again. If it doesn&apos;t complete
        shortly, contact support with the order below
        {refundAddress
          ? ` — if it can't be fulfilled, your funds return to ${short0x(refundAddress)}`
          : ""}
        .
      </span>
      {orderId && (
        <span className="font-mono muted" style={{ fontSize: 11 }}>
          Order {orderId}
        </span>
      )}
      {txHash && fromChain && (
        <a
          className="font-mono"
          style={{ fontSize: 11, color: "var(--accent)" }}
          href={explorerTxUrl(fromChain, txHash) ?? "#"}
          target="_blank"
          rel="noreferrer"
        >
          Your payment {short0x(txHash)}
        </a>
      )}
    </div>
  );
}

function RefundedCard({ refundAddress }: { refundAddress: string | null }) {
  return (
    <div
      className="col gap-2"
      style={{
        marginTop: 18,
        padding: 16,
        background: "var(--bg-soft)",
        border: "1px solid var(--line)",
        borderRadius: 12,
      }}
    >
      <strong style={{ fontSize: 14 }}>Order refunded</strong>
      <span className="muted" style={{ fontSize: 13 }}>
        This order couldn&apos;t be completed, so your deposit was returned
        {refundAddress
          ? ` to your connected wallet (${short0x(refundAddress)})`
          : ""}
        .
      </span>
    </div>
  );
}

function StatusModal({
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  body: React.ReactNode;
  confirmLabel?: string;
  onConfirm?: () => void;
  onClose: () => void;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div onClick={onClose} style={MODAL_OVERLAY}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ maxWidth: 360, width: "100%", padding: 20, boxShadow: MODAL_SHADOW }}
      >
        <strong style={{ fontSize: 15 }}>{title}</strong>
        <div
          className="muted"
          style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 8 }}
        >
          {body}
        </div>
        <div
          className="row gap-2"
          style={{ marginTop: 16, justifyContent: "flex-end" }}
        >
          <button className="btn btn-quiet btn-sm" onClick={onClose}>
            {confirmLabel ? "Cancel" : "Got it"}
          </button>
          {confirmLabel && (
            <button className="btn btn-primary btn-sm" onClick={onConfirm}>
              {confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Safety confirmation shown after copying the deposit address — this is the
 * moment funds can be lost to the wrong network, so the amount, chain, and
 * address are scannable in under two seconds, not buried in a paragraph.
 */
function BeforeYouSendModal({
  sendLabel,
  token,
  chainName,
  address,
  copied,
  onCopy,
  onClose,
}: {
  sendLabel: string;
  token: string;
  chainName: string;
  address: string;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div onClick={onClose} style={MODAL_OVERLAY}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Before you send"
        className="card col gap-4"
        style={{ maxWidth: 380, width: "100%", padding: 20, boxShadow: MODAL_SHADOW }}
      >
        <strong style={{ fontSize: 15 }}>Before you send</strong>

        <div className="col gap-2">
          <span className="eyebrow" style={{ fontSize: 10 }}>
            Send exactly
          </span>
          <span style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1 }}>
            {sendLabel}
          </span>
          <span
            className="chip chip-err"
            style={{ alignSelf: "flex-start", fontSize: 11, marginTop: 2 }}
          >
            {token ? `${token} on ${chainName} only` : `${chainName} only`}
          </span>
        </div>

        <button
          onClick={onCopy}
          className="row between center gap-3"
          style={{
            padding: "12px 14px",
            background: "var(--bg-soft)",
            border: "1px solid var(--line-2)",
            borderRadius: 10,
            cursor: "pointer",
            textAlign: "left",
            color: "inherit",
          }}
          title="Copy address"
          aria-label="Copy deposit address"
        >
          <span
            className="font-mono tabular"
            style={{ fontSize: 13, wordBreak: "break-all", lineHeight: 1.4 }}
          >
            {address}
          </span>
          {copied ? (
            <span
              className="row center gap-1"
              style={{ flex: "0 0 auto", fontSize: 11, color: "var(--ok)" }}
            >
              <Icon.Check size={12} /> Copied
            </span>
          ) : (
            <span style={{ flex: "0 0 auto", color: "var(--fg-mute)" }}>
              <Icon.Copy size={14} />
            </span>
          )}
        </button>

        <span className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
          Sending on any other network will lose the funds. Double-check the
          chain in your wallet before you confirm.
        </span>

        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn-primary btn-sm" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Compact tx-hash display with an optional explorer link. Honest fallback
 * to a plain mono span when we don't have an explorer URL for the chain.
 */
function RailRef({ text, href }: { text: string; href: string | null }) {
  if (!href) {
    return (
      <span
        className="font-mono"
        style={{ fontSize: 11, color: "var(--fg-mute)" }}
      >
        {text}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-mono"
      style={{
        fontSize: 11,
        color: "var(--accent)",
        textDecoration: "underline",
      }}
    >
      {text}
    </a>
  );
}

