"use client";

// SendScreen.tsx — Send screen w/ three states:
//   compose  → user types intent, fields parse, "Review route" CTA
//   review   → confirmation panel, "Confirm and sign" CTA, can edit
//   status   → 6-step timeline (Intent created → Paid)
// + error pattern: any parsed quote can return {error: "..."} which the
// compose card surfaces inline (insufficient / unsupported / missing / unavailable).

import React, { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { parseUnits } from "viem";
import { Icon } from "./icons";
import { SwapForm } from "./SwapForm";
import {
  useCctp,
  usePaycrestOfframp,
  usePaycrestOnramp,
  useRelaySwap,
  type CctpStatus,
  type PaycrestOfframpStatus,
  type PaycrestOnrampStatus,
  type RelaySwapStatus,
} from "@/hooks";
import type { ExecutionProgress } from "@/hooks/useRelayExecutor";
import { getChain, type ChainId, type TokenSymbol } from "@/config/network";
import type { PaycrestFiat, PaycrestToken } from "@/rails/paycrest";
import { formatFiat, formatNumber } from "@/utils";

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
export type Intent = { text: string; quote: Quote };

function isError(r: ParseResult): r is ParseError {
  return !!r && "error" in r;
}

/* ───────── intent presets ───────── */
const PLACEHOLDERS = [
  "Send ₦15,000 to 080-1234-4429 on Opay",
  "Send 20 USDC to 0xA2…91Bc on Arbitrum",
  "Move 100 USDC from Polygon to Base",
  "Cash out 200 USDC to GTBank 0124 4429",
  "Send 100 USDC to a EUR bank account",
];
const SUGGESTIONS = [
  "Send ₦50,000 to Tunde's Opay",
  "Cash out 200 USDC to GTBank",
  "Move 1.4 ETH on Base to Solana",
  "Send 100 USDC to a EUR bank account",
];

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
 * Calls /api/intent then /api/router, building an editable Quote — or a
 * ParseError the compose card surfaces inline. Replaces the old
 * pattern-matching demo parser: every field here is real, or honestly
 * marked "—" until the rail-specific quote step fills it in.
 */
async function resolveIntent(text: string): Promise<ParseResult> {
  // 1. parse the natural-language intent
  let intent: IntentResponse;
  try {
    const res = await fetch("/api/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    const data = await res.json();
    if (!res.ok) {
      return {
        error: "Couldn't read that",
        reason: data?.error || `Intent service error (${res.status}).`,
      };
    }
    intent = data as IntentResponse;
  } catch {
    return {
      error: "Network error",
      reason: "Couldn't reach the intent service — check your connection.",
    };
  }

  // 2. greeting / vague / explicitly needs more detail
  if (intent.action === "unclear" || intent.needsClarification) {
    return {
      error: "Need a bit more detail",
      reason:
        intent.clarificationQuestion ||
        "Tell me the amount, the token, and where it should go.",
    };
  }

  // 3. essentials present?
  if (intent.action === "onramp") {
    if (!intent.fromAmount) {
      return {
        error: "Missing details",
        reason: "How much do you want to buy — in fiat or USDC?",
      };
    }
    if (!intent.fiatCurrency) {
      return {
        error: "Missing details",
        reason:
          "Which fiat currency are you paying with? (e.g. NGN, KES)",
      };
    }
  } else if (!intent.fromChain || !intent.fromToken || !intent.fromAmount) {
    return {
      error: "Missing details",
      reason:
        "I couldn't pin down the source chain, token, or amount — try rephrasing.",
    };
  }

  // 4. pick the rail + build the quote
  return quoteFromIntent(intent);
}

/**
 * Router + quote half of the pipeline, shared by the natural-language path
 * (resolveIntent) and the structured guided flows. Takes a fully-formed
 * IntentResponse and returns a Quote or a ParseError.
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

/* ───────── Send root ───────── */
export function SendScreen({
  onSubmit,
  describeOnly = false,
}: {
  onSubmit: (intent: Intent) => void;
  /** Reached via the "Describe it" goal — lead with the language box only. */
  describeOnly?: boolean;
}) {
  const [stage, setStage] = useState<"compose" | "review">("compose");
  const [text, setText] = useState("");
  const [phIdx, setPhIdx] = useState(0);
  const [result, setResult] = useState<ParseResult>(null);
  const [thinking, setThinking] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (text) return;
    const id = setInterval(
      () => setPhIdx((n) => (n + 1) % PLACEHOLDERS.length),
      3000
    );
    return () => clearInterval(id);
  }, [text]);

  useEffect(() => {
    if (!text.trim()) {
      setResult(null);
      setThinking(false);
      return;
    }
    setThinking(true);
    let cancelled = false;
    const id = setTimeout(() => {
      resolveIntent(text).then((r) => {
        if (cancelled) return;
        setResult(r);
        setThinking(false);
      });
    }, 480);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [text]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [text]);

  const errored = isError(result);
  const isQuote = !!result && !errored;
  const quoteData: Quote | null = isQuote
    ? (result as Quote)
    : errored
      ? (result as ParseError).quote || null
      : null;

  if (stage === "review" && isQuote) {
    return (
      <ReviewScreen
        quote={result as Quote}
        text={text}
        onBack={() => setStage("compose")}
        onConfirm={(payout) =>
          onSubmit({
            text,
            quote: payout
              ? {
                  ...(result as Quote),
                  exec: { ...(result as Quote).exec, payout },
                }
              : (result as Quote),
          })
        }
      />
    );
  }

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
          {describeOnly ? "Describe it" : "Send"}
        </h1>
        <span className="muted" style={{ fontSize: 14, marginTop: 2 }}>
          {describeOnly
            ? "Tell us what you want in plain English — we'll work out the route."
            : "Pick your tokens and chains — or describe what you want in plain English."}
        </span>
      </header>

      {/* PRIMARY: the swap form (hidden when the user chose "Describe it"). */}
      {!describeOnly && <SwapForm onSubmit={onSubmit} />}

      {/* AI compose. Both paths end in the same StatusScreen. */}
      <div className="card" style={{ padding: 16 }}>
        <div className="row center gap-2" style={{ marginBottom: 8 }}>
          <Icon.Sparkle />
          <span className="eyebrow">
            {describeOnly ? "What would you like to do?" : "Or describe it in plain English"}
          </span>
        </div>
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={1}
          placeholder={PLACEHOLDERS[phIdx]}
          style={{
            width: "100%",
            resize: "none",
            border: 0,
            outline: "none",
            background: "transparent",
            color: "var(--fg)",
            fontSize: 16,
            lineHeight: 1.35,
            letterSpacing: "-0.01em",
            fontWeight: 500,
            padding: "4px 0",
          }}
        />
        <div className="row gap-2 wrap" style={{ marginTop: 10 }}>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setText(s)}
              className="chip"
              style={{ cursor: "pointer", fontSize: 11 }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Only render the AI's parse result + CTA once the user has typed something. */}
        {text.trim() && (
          <div className="col gap-3" style={{ marginTop: 14 }}>
            {errored && <ErrorBanner err={result as ParseError} />}
            <DetailsCard quote={quoteData} thinking={thinking} />
            <RouteCard quote={quoteData} thinking={thinking} />
            <button
              className="btn btn-fat"
              style={{
                background: isQuote ? "var(--btn-bg)" : "var(--bg-sunk)",
                color: isQuote ? "var(--btn-fg)" : "var(--fg-faint)",
                cursor: isQuote ? "pointer" : "default",
              }}
              disabled={!isQuote}
              onClick={() => isQuote && setStage("review")}
            >
              {isQuote ? (
                <>
                  Review route <Icon.ArrowRight />
                </>
              ) : errored ? (
                "Fix the issue to continue"
              ) : (
                "Reading…"
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────── error banner ───────── */
function ErrorBanner({ err }: { err: ParseError }) {
  return (
    <div
      className="row"
      style={{
        padding: "14px 16px",
        background: "var(--err-soft)",
        border: "1px solid var(--err)",
        borderRadius: 12,
        gap: 12,
        alignItems: "flex-start",
        animation: "fade-up .25s var(--ease) both",
      }}
    >
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "var(--err)",
          color: "#fff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flex: "0 0 22px",
        }}
      >
        !
      </span>
      <div className="col" style={{ gap: 2 }}>
        <strong style={{ fontSize: 14, color: "var(--err)" }}>
          {err.error}
        </strong>
        <span
          className="muted"
          style={{ fontSize: 13, color: "var(--fg-soft)" }}
        >
          {err.reason}
        </span>
      </div>
    </div>
  );
}

/* ───────── editable details card ───────── */
function DetailsCard({
  quote,
  thinking,
}: {
  quote: Quote | null;
  thinking: boolean;
}) {
  // Guard: while parser is mid-flight, `quote` is null even though `thinking`
  // is true — render the placeholder skeleton in that window so EditPill
  // doesn't try to read `quote.from.token` on null.
  const empty = !quote || !quote.from;
  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="row between center" style={{ marginBottom: 14 }}>
        <span className="eyebrow">Details</span>
        <span
          className="font-mono"
          style={{ fontSize: 11, color: "var(--fg-mute)" }}
        >
          {thinking ? (
            <span className="row center gap-2">
              <Icon.Spinner size={11} /> understanding…
            </span>
          ) : empty ? (
            "—"
          ) : (
            <span className="row center gap-2" style={{ color: "var(--ok)" }}>
              <Icon.Check size={11} /> parsed · edit anything
            </span>
          )}
        </span>
      </div>

      {/* From */}
      <FieldGroup title="From">
        {empty || !quote ? (
          <FieldPlaceholder />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 12,
            }}
          >
            <EditPill label="Token" value={quote.from.token} />
            <EditPill label="Chain" value={quote.from.chain} />
            <EditPill
              label="Amount"
              value={Number(quote.from.amount).toLocaleString("en-US", {
                minimumFractionDigits: quote.from.amount < 10 ? 2 : 0,
                maximumFractionDigits: 2,
              })}
              mono
            />
          </div>
        )}
      </FieldGroup>

      <div className="hr" style={{ margin: "14px 0" }} />

      {/* To */}
      <FieldGroup title="To">
        {empty || !quote ? (
          <FieldPlaceholder />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1.2fr",
              gap: 12,
            }}
          >
            <EditPill label="Type" value={quote.to.kind} />
            <EditPill label="Currency" value={quote.to.currency} />
            <EditPill
              label="Will receive"
              value={quote.to.amount}
              accent
              mono
            />
          </div>
        )}
      </FieldGroup>

      <div className="hr" style={{ margin: "14px 0" }} />

      {/* Recipient */}
      <FieldGroup title="Recipient">
        {empty || !quote ? (
          <FieldPlaceholder small />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1.4fr",
              gap: 12,
            }}
          >
            <EditPill
              label={
                quote.to.kind === "Wallet" || quote.to.kind === "Chain"
                  ? "Network"
                  : "Destination"
              }
              value={quote.to.label}
            />
            <EditPill
              label={
                quote.to.kind === "Wallet" || quote.to.kind === "Chain"
                  ? "Address"
                  : quote.to.kind === "Mobile money"
                    ? "Phone · name"
                    : "Account · name"
              }
              value={quote.to.sub}
              mono
            />
          </div>
        )}
      </FieldGroup>
    </div>
  );
}

function FieldGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="col gap-3">
      <span
        className="font-mono"
        style={{
          fontSize: 10,
          letterSpacing: 0.1,
          color: "var(--fg-mute)",
          textTransform: "uppercase",
        }}
      >
        {title}
      </span>
      {children}
    </div>
  );
}

function EditPill({
  label,
  value,
  mono,
  accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <button
      className="col"
      style={{
        padding: 12,
        background: "var(--bg-soft)",
        borderRadius: 10,
        border: "1px solid var(--line)",
        textAlign: "left",
        color: "inherit",
        gap: 4,
        cursor: "pointer",
        transition: "border-color .12s",
      }}
      onMouseOver={(e) => (e.currentTarget.style.borderColor = "var(--line-2)")}
      onMouseOut={(e) => (e.currentTarget.style.borderColor = "var(--line)")}
    >
      <div className="row between center">
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
        <Icon.Edit />
      </div>
      <span
        className={mono ? "font-mono tabular" : ""}
        style={{
          fontSize: 14,
          fontWeight: 500,
          color: accent ? "var(--accent)" : "var(--fg)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {value || "—"}
      </span>
    </button>
  );
}

function FieldPlaceholder({ small }: { small?: boolean }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 12,
      }}
    >
      {[...Array(small ? 2 : 3)].map((_, i) => (
        <div
          key={i}
          style={{
            height: small ? 50 : 64,
            background: "var(--bg-soft)",
            borderRadius: 10,
            border: "1px dashed var(--line-2)",
          }}
        />
      ))}
    </div>
  );
}

/* ───────── route summary card ───────── */
function RouteCard({
  quote,
  thinking,
}: {
  quote: Quote | null;
  thinking: boolean;
}) {
  if (!quote) {
    return (
      <div
        className="card"
        style={{ padding: 20, opacity: thinking ? 1 : 0.6 }}
      >
        <span className="eyebrow">Route</span>
        <p className="muted" style={{ fontSize: 14, marginTop: 12 }}>
          {thinking
            ? "Planning the route…"
            : "We show the route, fee, and arrival time before anything is signed."}
        </p>
      </div>
    );
  }
  return (
    <div className="card" style={{ padding: 20 }}>
      <div
        className="row between center wrap"
        style={{ marginBottom: 18, gap: 12 }}
      >
        <span className="eyebrow">Route</span>
        <span className="row center gap-3">
          <span
            className="font-mono"
            style={{ fontSize: 11, color: "var(--fg-mute)" }}
          >
            ETA {quote.eta}
          </span>
          <span className="chip chip-ok" style={{ padding: "2px 8px" }}>
            ● Best route
          </span>
        </span>
      </div>

      {/* rail stages */}
      <div className="row between center" style={{ marginBottom: 18 }}>
        {quote.rail.map((r, i) => (
          <React.Fragment key={r}>
            <div
              className="col center"
              style={{ alignItems: "center", gap: 6, flex: 1 }}
            >
              <span
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
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
                  position: "relative",
                }}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      <div className="hr" />

      {/* fee breakdown */}
      <div className="col gap-2" style={{ fontSize: 13, marginTop: 14 }}>
        <FeeRow label="Network fee" value={quote.fee.network} />
        <FeeRow label="Rail fee" value={quote.fee.rail} />
        <FeeRow label="FX spread" value={quote.fee.spread} hint={quote.rate} />
        <div className="hr" style={{ margin: "4px 0" }} />
        <FeeRow
          label={<strong style={{ fontWeight: 500 }}>Total</strong>}
          value={
            <strong className="font-mono tabular" style={{ fontWeight: 500 }}>
              {quote.fee.total}
            </strong>
          }
        />
      </div>
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
}: {
  quote: Quote;
  text: string;
  onBack: () => void;
  onConfirm: (payout: PayoutDetails | null) => void;
}) {
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();

  // Paycrest fiat legs need structured bank / mobile-money details.
  const isOfframp = quote.exec.action === "offramp";
  const isOnramp =
    quote.exec.action === "onramp" && quote.exec.rail === "paycrest";
  const needsAccountDetails = isOfframp || isOnramp;
  const [payout, setPayout] = useState<PayoutDetails>({
    institution: "",
    institutionName: "",
    accountIdentifier: quote.exec.recipient ?? "",
    accountName: "",
  });
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
          onChange={setPayout}
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
            ? "You'll transfer fiat to the virtual account we show next; USDC arrives in your wallet once settled."
            : isOfframp
              ? "You'll send the stablecoin in your wallet; the provider then pays out the fiat."
              : "You'll approve the transactions in your wallet. Funds move only after that."}
      </span>
    </div>
  );
}

/* ───────── payout / refund account form (Paycrest fiat legs) ───────── */
function PayoutForm({
  currency,
  value,
  onChange,
  mode = "payout",
}: {
  currency: string | null;
  value: PayoutDetails;
  onChange: (next: PayoutDetails) => void;
  mode?: "payout" | "refund";
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

  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="row between center" style={{ marginBottom: 14 }}>
        <span className="eyebrow">
          {mode === "refund" ? "Refund account" : "Payout details"}
        </span>
        <span className="font-mono" style={{ fontSize: 11, color: "var(--fg-mute)" }}>
          {currency
            ? mode === "refund"
              ? `Refunds in ${currency}`
              : `Paid out in ${currency}`
            : "—"}
        </span>
      </div>

      <div className="col gap-3">
        <label className="col gap-1">
          <span className="font-mono" style={{ fontSize: 10, letterSpacing: 0.06, color: "var(--fg-mute)", textTransform: "uppercase" }}>
            Bank / mobile money
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
                ? "Loading institutions…"
                : loadError
                  ? "Couldn't load institutions"
                  : "Select institution"}
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
    </div>
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
          <span style={{ fontSize: 14, fontWeight: 500 }}>{name}</span>
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
      l: "Create order",
      d: "Locking a rate and reserving a virtual deposit account.",
      ref: orderId ? `order ${orderId.slice(0, 8)}…` : undefined,
    },
    {
      l: "Deposit fiat",
      d: "Transfer the exact fiat amount to the account shown below.",
      ref: depositLabel ?? undefined,
    },
    {
      l: "Provider settles",
      d: "The provider confirms your deposit and releases stablecoin.",
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

function paycrestStages(
  status: PaycrestOfframpStatus,
  orderId: string | null,
  transferTxHash: string | null,
  fromChain: ChainId,
  token: string,
  currency: string | null,
  accountName: string | null
): { stages: StageRow[]; activeIndex: number; done: boolean } {
  const srcName = getChain(fromChain)?.name ?? fromChain;
  const stages: StageRow[] = [
    {
      l: "Create order",
      d: "Reserving the payout with a liquidity provider.",
      ref: orderId ? `order ${orderId.slice(0, 8)}…` : undefined,
    },
    {
      l: `Send ${token} on ${srcName}`,
      d: "Sending the stablecoin to the provider's address.",
      ref: transferTxHash ? `tx ${short0x(transferTxHash)}` : undefined,
      refHref: transferTxHash
        ? explorerTxUrl(fromChain, transferTxHash) ?? undefined
        : undefined,
    },
    {
      l: "Provider settles",
      d: "The provider is paying out the fiat to the recipient.",
    },
    {
      l: "Paid out",
      d: `${currency ?? "Fiat"} delivered${accountName ? ` to ${accountName}` : ""}.`,
    },
  ];

  const indexFor: Record<PaycrestOfframpStatus, number> = {
    idle: -1,
    creating: 0,
    awaiting_funding: 1,
    funding: 1,
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

  // Kick off execution exactly once per intent.
  const startedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!exec || !intent) return;
    // Identify a run by the intent text + rail; lets a "Send another"
    // round-trip start a fresh execution.
    const runKey = `${intent.text}|${exec.rail}|${exec.fromChain}|${exec.toChain}|${exec.fromAmount}`;
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
  }, [intent, isConnected, address]);

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
              paycrestOfframp.status,
              paycrestOfframp.order?.id ?? null,
              paycrestOfframp.transferTxHash,
              exec.fromChain,
              exec.fromToken,
              exec.fiatCurrency,
              exec.payout?.accountName ?? null
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

  // Off-ramp invoice: shown after the order is created, before the user
  // sends the stablecoin (no auto-firing the wallet).
  const isOfframpRail =
    exec?.rail === "paycrest" && exec.action !== "onramp";
  const offrampOrder = isOfframpRail ? paycrestOfframp.order : null;
  const offrampFunding =
    isOfframpRail && paycrestOfframp.status === "funding";
  // Keep the invoice on screen while the wallet prompt is open, so it
  // doesn't collapse when the user taps Send.
  const showInvoice =
    isOfframpRail &&
    (paycrestOfframp.status === "awaiting_funding" || offrampFunding) &&
    !!offrampOrder?.receiveAddress;
  const fiatReceive =
    offrampOrder?.rate && offrampOrder.amount
      ? Number(offrampOrder.amount) * Number(offrampOrder.rate)
      : null;
  const fiatReceiveLabel =
    fiatReceive !== null && exec?.fiatCurrency
      ? formatFiat(exec.fiatCurrency, fiatReceive)
      : null;

  // Wall-clock elapsed since this screen mounted.
  const startedAt = useRef(Date.now()).current;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const elapsed = Math.floor((now - startedAt) / 1000);

  const headline = done
    ? "Sent."
    : railError || bootError
      ? "Stalled."
      : cctp.status === "idle"
        ? "Starting…"
        : "Sending…";

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
          <span className="chip">
            <span className="font-mono tabular">{elapsed}s</span> elapsed
          </span>
          <button className="btn btn-ghost btn-sm" onClick={onDone}>
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
          <Icon.ArrowRight />
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
            {offrampOrder?.rate && (
              <span className="muted font-mono" style={{ fontSize: 11, marginTop: 2 }}>
                rate {offrampOrder.rate}/{intent?.quote?.from?.token}
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

        {/* Off-ramp invoice — review, then send. No auto-firing the wallet. */}
        {showInvoice && offrampOrder?.receiveAddress && !bootError && (
          <div
            className="col gap-3"
            style={{
              marginTop: 18,
              padding: 16,
              background: "var(--accent-soft)",
              border: "1px solid var(--line-2)",
              borderRadius: 12,
            }}
          >
            <strong style={{ fontSize: 14 }}>Confirm and send</strong>
            <span style={{ fontSize: 13, color: "var(--fg-soft)" }}>
              Send exactly{" "}
              <strong className="font-mono">
                {offrampOrder.amount} {intent?.quote?.from?.token}
              </strong>{" "}
              on {intent?.quote?.from?.chain} to fund this payout.
            </span>

            <div className="col gap-1">
              <span className="eyebrow" style={{ fontSize: 10 }}>
                Receive address
              </span>
              <button
                onClick={() => {
                  navigator.clipboard
                    ?.writeText(offrampOrder.receiveAddress ?? "")
                    .then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1600);
                    })
                    .catch(() => {});
                }}
                className="row between center"
                style={{
                  padding: "10px 12px",
                  background: "var(--bg-soft)",
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                  cursor: "pointer",
                  textAlign: "left",
                  color: "inherit",
                }}
                title="Copy address"
              >
                <span
                  className="font-mono"
                  style={{ fontSize: 12, wordBreak: "break-all" }}
                >
                  {offrampOrder.receiveAddress}
                </span>
                {copied ? (
                  <span
                    className="row center gap-1"
                    style={{ flex: "0 0 auto", fontSize: 11, color: "var(--ok)" }}
                  >
                    <Icon.Check size={12} /> Copied
                  </span>
                ) : (
                  <Icon.Copy size={13} />
                )}
              </button>
            </div>

            {(fiatReceiveLabel || offrampOrder.rate) && (
              <span className="muted" style={{ fontSize: 12 }}>
                {intent?.quote?.to?.sub ? `${intent.quote.to.sub} ` : ""}
                receives{" "}
                <strong style={{ color: "var(--fg)" }}>
                  {fiatReceiveLabel ?? "—"}
                </strong>
                {offrampOrder.rate
                  ? ` · rate ${offrampOrder.rate}/${intent?.quote?.from?.token}`
                  : ""}
              </span>
            )}
            {offrampOrder.validUntil && (
              <span className="muted" style={{ fontSize: 12 }}>
                Send before {new Date(offrampOrder.validUntil).toLocaleTimeString()}
              </span>
            )}

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
                  Send {offrampOrder.amount} {intent?.quote?.from?.token}{" "}
                  <Icon.ArrowRight />
                </>
              )}
            </button>
            <span className="muted" style={{ fontSize: 11, textAlign: "center" }}>
              You&apos;ll approve the transfer in your wallet. Or send the exact
              amount to the address above yourself.
            </span>
          </div>
        )}

        {/* Live timeline — only rendered when we actually have a rail to drive. */}
        {!bootError && stages.length > 0 && (
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
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  startedFor.current = null;
                  cctp.reset();
                  paycrestOfframp.reset();
                  paycrestOnramp.reset();
                  relay.reset();
                }}
              >
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
                Sent {intent?.quote?.to?.amount} in {elapsed}s
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
      </div>
    </div>
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

