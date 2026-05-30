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
import { useCctp, type CctpStatus } from "@/hooks";
import { getChain, type ChainId, type TokenSymbol } from "@/config/network";

/* ───────── types ───────── */
export type RailKey = "cctp" | "chainrails" | "relay" | "paycrest";

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
type IntentResponse = {
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
  if (!intent.fromChain || !intent.fromToken || !intent.fromAmount) {
    return {
      error: "Missing details",
      reason:
        "I couldn't pin down the source chain, token, or amount — try rephrasing.",
    };
  }

  // 4. pick the rail
  let routed: RouterResponse;
  try {
    const res = await fetch("/api/router", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: intent.action,
        fromChain: intent.fromChain,
        fromToken: intent.fromToken,
        amount: intent.fromAmount,
        toChain: intent.toChain ?? undefined,
        toToken: intent.toToken ?? undefined,
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
  const recipient = intent.recipient || "";

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
    : {
        kind: intent.action === "swap" ? "Wallet" : "Chain",
        currency: intent.toToken || fromToken,
        amount: `${amount.toLocaleString("en-US", {
          maximumFractionDigits: 4,
        })} ${intent.toToken || fromToken}`,
        label: prettyChain(intent.toChain),
        sub: recipient || "Your connected wallet",
      };

  const railStages = isOfframp
    ? ["Deposit", "Settle", "Payout"]
    : routed.rail === "cctp"
      ? ["Lock", "Confirm", "Release"]
      : intent.action === "swap"
        ? ["Deposit", "Swap", "Receive"]
        : ["Deposit", "Bridge", "Receive"];

  return {
    from: { token: fromToken, chain: prettyChain(intent.fromChain), amount },
    to,
    rate: null,
    fee: { network: "—", rail: railFee, spread: "—", total },
    eta: RAIL_ETA[routed.rail],
    rail: railStages,
    kind: isOfframp ? "fiat" : "crosschain",
    railName: RAIL_LABEL[routed.rail],
    railReason: routed.reason,
    exec: {
      rail: routed.rail,
      action: intent.action === "unclear" ? "bridge" : intent.action,
      fromChain: intent.fromChain as ChainId,
      fromToken: fromToken as TokenSymbol,
      fromAmount: intent.fromAmount || "0",
      toChain: (intent.toChain as ChainId | null) ?? null,
      toToken: (intent.toToken as TokenSymbol | null) ?? null,
      fiatCurrency: intent.fiatCurrency,
      recipient: intent.recipient,
    },
  };
}

/* ───────── Send root ───────── */
export function SendScreen({
  onSubmit,
}: {
  onSubmit: (intent: Intent) => void;
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
        onConfirm={() => onSubmit({ text, quote: result as Quote })}
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
          Send
        </h1>
        <span className="muted" style={{ fontSize: 14, marginTop: 2 }}>
          Pick your tokens and chains — or describe what you want in plain English.
        </span>
      </header>

      {/* PRIMARY: the swap form */}
      <SwapForm onSubmit={onSubmit} />

      {/* SECONDARY: AI compose. Both paths end in the same StatusScreen. */}
      <div className="card" style={{ padding: 16 }}>
        <div className="row center gap-2" style={{ marginBottom: 8 }}>
          <Icon.Sparkle />
          <span className="eyebrow">Or describe it in plain English</span>
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
function ReviewScreen({
  quote,
  text,
  onBack,
  onConfirm,
}: {
  quote: Quote;
  text: string;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  // Rails that need a wallet signature on the source side. Paycrest also
  // ultimately needs a funded source wallet, but the order itself can be
  // created without one — we still require connect to capture the refund
  // address.
  const needsWallet = true;
  const walletReady = isConnected || !needsWallet;
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
              {quote.from.amount}{" "}
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
              {quote.to.label} · {quote.to.sub}
            </span>
          </div>
        </div>

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
      </div>

      <button
        className="btn btn-fat"
        style={{
          background: walletReady ? "var(--btn-bg)" : "var(--accent)",
          color: walletReady ? "var(--btn-fg)" : "#fff",
        }}
        onClick={walletReady ? onConfirm : () => openConnectModal?.()}
      >
        {walletReady ? (
          <>
            Confirm and sign <Icon.ArrowRight />
          </>
        ) : (
          <>
            Connect wallet to continue <Icon.ArrowRight />
          </>
        )}
      </button>
      <span className="muted" style={{ fontSize: 12, textAlign: "center" }}>
        {walletReady
          ? "You'll approve the transactions in your wallet. Funds move only after that."
          : "We need a connected wallet to sign the source-chain transaction."}
      </span>
    </div>
  );
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

  // Local error for cases where we can't even hand off to a rail
  // (no wallet, missing chain, etc.) — distinct from the rail's own error.
  const [bootError, setBootError] = useState<string | null>(null);

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

    if (!isConnected || !address) {
      setBootError(
        "Connect a wallet first — the source-chain transaction needs to be signed by the sender."
      );
      return;
    }

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
      : { stages: [], activeIndex: -1, done: false };

  const stages = view.stages;
  const activeIndex = view.activeIndex;
  const done = view.done;
  const railError = exec?.rail === "cctp" ? cctp.error : null;

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
              {intent?.quote?.from?.amount} {intent?.quote?.from?.token}
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
              {intent?.quote?.to?.amount}
            </span>
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

