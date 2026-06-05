"use client";

/**
 * SwapForm — ARC swap card.
 *
 * The visual port of `ARC Swap.html` from the design bundle: dark glass
 * card, "From / flip / To" panes, route-preview accordion, gradient CTA.
 * Drops the prototype's mocked data (balances, sparkline rates, settings
 * popover, success modal) and wires the real plumbing instead:
 *
 *   - Token lists from `@/lib/lifi` (LiFi catalog filtered to ACTIVE_CHAINS)
 *   - Quote from POST /api/router → buildFormQuote → Quote
 *   - Wallet via wagmi + RainbowKit's connect modal
 *   - Confirm hands a fully-formed Intent up to SendScreen, which routes
 *     it through StatusScreen for real execution (CCTP, etc.)
 *
 * Settings popover, balance reads, MEV toggle, and the success modal are
 * later slices — for now the card honestly shows what we actually have.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import {
  loadChains,
  tokensForChain,
  type RegistryChain,
  type RegistryToken,
} from "@/lib/lifi";
import { DEFAULT_SETTLEMENT_CHAIN_ID } from "@/config/network";
import {
  TokenGlyph,
  TokenPickerModal,
  TokenPill,
  type TokenChainSelection,
} from "./TokenChainPicker";
import type { Intent, Quote, QuoteExec, RailKey } from "./SendScreen";

// ---------------------------------------------------------------------------
// Router response (mirrors the slice SendScreen already consumes)
// ---------------------------------------------------------------------------

interface RouterResponse {
  rail: RailKey;
  reason: string;
  quote:
    | {
        rail: "cctp";
        fees: { finalityThreshold: number; minimumFee: number }[];
      }
    | null;
  quoteEndpoint: string | null;
}

const RAIL_LABEL: Record<RailKey, string> = {
  cctp: "CCTP",
  chainrails: "Chainrails",
  relay: "Relay",
  paycrest: "Paycrest",
};

const RAIL_ETA: Record<RailKey, string> = {
  cctp: "≈ 1 min",
  chainrails: "≈ 1–3 min",
  relay: "≈ 30 s",
  paycrest: "≈ 2 min",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SwapForm({ onSubmit }: { onSubmit: (intent: Intent) => void }) {
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();

  const [from, setFrom] = useState<TokenChainSelection>({
    chain: DEFAULT_SETTLEMENT_CHAIN_ID,
    tokenAddress: "",
    tokenSymbol: "",
    tokenDecimals: 0,
    amount: "0.5",
  });
  const [to, setTo] = useState<TokenChainSelection>({
    chain: DEFAULT_SETTLEMENT_CHAIN_ID,
    tokenAddress: "",
    tokenSymbol: "",
    tokenDecimals: 0,
    amount: "",
  });

  const [picker, setPicker] = useState<{ open: boolean; mode: "from" | "to" }>({
    open: false,
    mode: "from",
  });
  const [flipping, setFlipping] = useState(false);
  // Route preview is collapsed by default — the one-line rate row is the
  // primary signal; the fee breakdown opens on click. Matches the original.
  const [routeOpen, setRouteOpen] = useState(false);

  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Registry caches for the inline TokenPill (so the pill can show the
  // logo without re-fetching every render).
  const [chains, setChains] = useState<RegistryChain[]>([]);
  const [fromTokens, setFromTokens] = useState<RegistryToken[]>([]);
  const [toTokens, setToTokens] = useState<RegistryToken[]>([]);

  useEffect(() => {
    loadChains().then(setChains).catch(() => setChains([]));
  }, []);
  useEffect(() => {
    tokensForChain(from.chain).then(setFromTokens).catch(() => setFromTokens([]));
  }, [from.chain]);
  useEffect(() => {
    tokensForChain(to.chain).then(setToTokens).catch(() => setToTokens([]));
  }, [to.chain]);

  // Any field change invalidates the previous quote.
  useEffect(() => {
    setQuote(null);
    setQuoteError(null);
  }, [
    from.chain,
    from.tokenAddress,
    from.amount,
    to.chain,
    to.tokenAddress,
  ]);

  const fromChain = useMemo(
    () => chains.find((c) => c.id === from.chain),
    [chains, from.chain]
  );
  const toChain = useMemo(
    () => chains.find((c) => c.id === to.chain),
    [chains, to.chain]
  );
  const fromToken = useMemo(
    () =>
      fromTokens.find(
        (t) => t.address.toLowerCase() === from.tokenAddress.toLowerCase()
      ),
    [fromTokens, from.tokenAddress]
  );
  const toToken = useMemo(
    () =>
      toTokens.find(
        (t) => t.address.toLowerCase() === to.tokenAddress.toLowerCase()
      ),
    [toTokens, to.tokenAddress]
  );

  const action: QuoteExec["action"] =
    from.chain === to.chain ? "swap" : "bridge";
  const crossChain = from.chain !== to.chain;

  const canQuote =
    !!from.tokenAddress && !!to.tokenAddress && Number(from.amount) > 0;

  // ---------- handlers ----------
  const flip = () => {
    setFlipping(true);
    setTimeout(() => setFlipping(false), 400);
    setFrom(to);
    setTo({ ...from, amount: "" });
  };
  const setPct = (pct: number) => {
    // Without an on-chain balance read this is purely cosmetic for now.
    // Plug a real `useReadContract(USDC.balanceOf)` in when we add the
    // balance slice; for now the buttons just scale whatever's typed.
    const cur = Number(from.amount) || 0;
    if (cur > 0) setFrom({ ...from, amount: (cur * pct).toString() });
  };
  const openPicker = (mode: "from" | "to") =>
    setPicker({ open: true, mode });

  const getQuote = async () => {
    if (!canQuote) return;
    setQuoteLoading(true);
    setQuoteError(null);
    try {
      const res = await fetch("/api/router", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          fromChain: from.chain,
          fromToken: from.tokenSymbol,
          amount: from.amount,
          toChain: to.chain,
          toToken: to.tokenSymbol,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `Router error (${res.status}).`);
      }
      setQuote(buildFormQuote(data as RouterResponse, from, to, action));
    } catch (err) {
      setQuoteError(
        err instanceof Error ? err.message : "Couldn't price this route."
      );
    } finally {
      setQuoteLoading(false);
    }
  };

  const confirm = () => {
    if (!quote) return;
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    const text = `Send ${from.amount} ${from.tokenSymbol} from ${from.chain} to ${to.chain}`;
    onSubmit({ text, quote });
  };

  const ctaState: "primary" | "disabled" | "loading" = quoteLoading
    ? "loading"
    : !canQuote
      ? "disabled"
      : "primary";

  const ctaLabel = quoteLoading
    ? "Pricing route…"
    : !from.tokenAddress
      ? "Pick a token to swap from"
      : !to.tokenAddress
        ? "Pick a token to receive"
        : Number(from.amount) <= 0
          ? "Enter an amount"
          : quote
            ? !isConnected
              ? "Connect wallet to swap"
              : crossChain
                ? `Swap & bridge to ${toChain?.name ?? to.chain}`
                : `Swap ${from.tokenSymbol} for ${to.tokenSymbol}`
            : "Get quote";

  const outAmount = quote?.from?.amount && quote.to?.amount ? quote.to.amount : "";

  return (
    <div className="arc-root" style={{ display: "flex", justifyContent: "center" }}>
      <div className="arc-card">
        {/* Head */}
        <div className="arc-card-head">
          <div className="arc-ch-title">
            <span>Swap</span>
            {crossChain && (
              <span className="arc-ch-tag">
                <BoltIcon /> Cross-chain
              </span>
            )}
          </div>
          <div className="arc-ch-actions">
            <button
              className="arc-icon-btn"
              type="button"
              title="Settings (coming soon)"
              aria-label="Settings"
              disabled
              style={{ opacity: 0.4, cursor: "not-allowed" }}
            >
              <SettingsIcon />
            </button>
          </div>
        </div>

        {/* From pane */}
        <div className={"arc-pane" + (flipping ? " flipping" : "")}>
          <div className="arc-pane-head">
            <span className="arc-pane-label">From</span>
            <span className="arc-pane-meta">
              {/* Balance reads land in the next slice; placeholder em-dash
                  matches the design's rhythm without inventing a number. */}
              Balance: <span style={{ fontFamily: "Geist Mono, monospace" }}>—</span>
            </span>
          </div>
          <div className="arc-pane-body">
            <input
              className="arc-amount"
              type="text"
              inputMode="decimal"
              value={from.amount}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9.]/g, "");
                if ((v.match(/\./g) || []).length > 1) return;
                setFrom({ ...from, amount: v });
              }}
              placeholder="0"
            />
            <TokenPill
              value={from}
              registryToken={fromToken}
              registryChain={fromChain}
              onClick={() => openPicker("from")}
            />
          </div>
          <div className="arc-pane-foot">
            <span className="arc-usd-val">
              {fromChain ? fromChain.name : ""}
            </span>
            <div className="arc-pct-row">
              {[0.25, 0.5, 0.75, 1].map((p) => (
                <button
                  key={p}
                  type="button"
                  className="arc-pct"
                  onClick={() => setPct(p)}
                >
                  {p === 1 ? "MAX" : `${p * 100}%`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Flip */}
        <div className="arc-flip-wrap">
          <button
            type="button"
            className={"arc-flip-btn" + (flipping ? " spin" : "")}
            onClick={flip}
            aria-label="Swap direction"
          >
            <FlipIcon />
          </button>
        </div>

        {/* To pane */}
        <div className={"arc-pane" + (flipping ? " flipping" : "")}>
          <div className="arc-pane-head">
            <span className="arc-pane-label">To</span>
            <span className="arc-pane-meta">
              Balance: <span style={{ fontFamily: "Geist Mono, monospace" }}>—</span>
            </span>
          </div>
          <div className="arc-pane-body">
            {outAmount ? (
              <span
                className="arc-amount arc-amount--display"
                style={{ flex: 1, minWidth: 0 }}
              >
                {outAmount}
              </span>
            ) : (
              <span
                className="arc-out-placeholder"
                style={{ flex: 1, minWidth: 0 }}
              >
                0
              </span>
            )}
            <TokenPill
              value={to}
              registryToken={toToken}
              registryChain={toChain}
              onClick={() => openPicker("to")}
            />
          </div>
          <div className="arc-pane-foot">
            <span className="arc-usd-val">
              {toChain ? toChain.name : ""}
            </span>
          </div>
        </div>

        {/* Quote error */}
        {quoteError && (
          <div className="arc-warning" style={{ marginTop: 14 }}>
            <AlertIcon /> {quoteError}
          </div>
        )}

        {/* Route preview accordion */}
        {quote && (
          <div className={"arc-route-card" + (routeOpen ? " open" : "")}>
            <button
              type="button"
              className="arc-route-toggle"
              onClick={() => setRouteOpen((v) => !v)}
            >
              <div className="arc-rt-l">
                <div className="arc-rt-rate">
                  {from.amount} {from.tokenSymbol} → {outAmount}
                </div>
                <div className="arc-rt-meta">
                  <span>
                    <BoltIcon /> {quote.eta}
                  </span>
                  <span>
                    <GasIcon /> {quote.fee.rail !== "—" ? quote.fee.rail : "fee on next step"}
                  </span>
                  <span className="arc-rt-shield">
                    <ShieldIcon /> Best route
                  </span>
                </div>
              </div>
              <div className="arc-rt-r">
                <ChevronDown
                  size={16}
                  className={"arc-chev" + (routeOpen ? " up" : "")}
                />
              </div>
            </button>
            <div className="arc-route-body">
              <div className="arc-rb-row">
                <span className="arc-rb-k">Network fee</span>
                <span className="arc-rb-v">{quote.fee.network}</span>
              </div>
              <div className="arc-rb-row">
                <span className="arc-rb-k">Rail fee</span>
                <span className="arc-rb-v">{quote.fee.rail}</span>
              </div>
              <div className="arc-rb-row">
                <span className="arc-rb-k">FX spread</span>
                <span className="arc-rb-v">{quote.fee.spread}</span>
              </div>
              <div className="arc-rb-row">
                <span className="arc-rb-k">Total</span>
                <span className="arc-rb-v">{quote.fee.total}</span>
              </div>
            </div>
          </div>
        )}

        {/* CTA */}
        <button
          type="button"
          className={`arc-cta ${ctaState}`}
          disabled={ctaState !== "primary"}
          onClick={quote ? confirm : getQuote}
        >
          {ctaState === "loading" && <span className="arc-cta-spin" />}
          {!quote && ctaState === "primary" && <BoltIcon />}
          {quote && !isConnected && <WalletIcon />}
          {ctaLabel}
        </button>

        {/* Foot */}
        <div className="arc-card-foot">
          <ShieldIcon /> <span>Routes via the cheapest available rail</span>
          <span className="dot">·</span>
          <span>CCTP · Chainrails · Relay · Paycrest</span>
        </div>
      </div>

      <TokenPickerModal
        open={picker.open}
        mode={picker.mode}
        onClose={() => setPicker({ ...picker, open: false })}
        onPick={(next) => {
          if (picker.mode === "from") {
            // If picking the same token we already have on the other side,
            // swap them so the form never ends up with from === to.
            if (
              next.chain === to.chain &&
              next.tokenAddress.toLowerCase() === to.tokenAddress.toLowerCase()
            ) {
              setTo({ ...from });
            }
            setFrom({ ...next, amount: from.amount });
          } else {
            if (
              next.chain === from.chain &&
              next.tokenAddress.toLowerCase() ===
                from.tokenAddress.toLowerCase()
            ) {
              setFrom({ ...to, amount: from.amount });
            }
            setTo({ ...next, amount: "" });
          }
          setPicker({ ...picker, open: false });
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quote builder — produces the same Quote shape the AI flow does, so the
// downstream Review + Status screens stay rail-agnostic.
// ---------------------------------------------------------------------------

function buildFormQuote(
  routed: RouterResponse,
  from: TokenChainSelection,
  to: TokenChainSelection,
  action: QuoteExec["action"]
): Quote {
  const amount = Number(from.amount) || 0;

  let railFee = "—";
  let total = "Quoted at next step";
  if (routed.quote && routed.quote.rail === "cctp") {
    const fast = routed.quote.fees.find((f) => f.finalityThreshold === 1000);
    if (fast) {
      const usdc = (amount * fast.minimumFee) / 10_000;
      railFee = `${usdc.toFixed(4)} ${from.tokenSymbol}`;
      total = railFee;
    }
  }

  const railStages =
    routed.rail === "cctp"
      ? ["Lock", "Confirm", "Release"]
      : action === "swap"
        ? ["Deposit", "Swap", "Receive"]
        : ["Deposit", "Bridge", "Receive"];

  return {
    from: { token: from.tokenSymbol, chain: prettyChainId(from.chain), amount },
    to: {
      kind: action === "swap" ? "Wallet" : "Chain",
      currency: to.tokenSymbol,
      amount: `${amount.toLocaleString("en-US", {
        maximumFractionDigits: 4,
      })} ${to.tokenSymbol}`,
      label: prettyChainId(to.chain),
      sub: "Your connected wallet",
    },
    rate: null,
    fee: { network: "—", rail: railFee, spread: "—", total },
    eta: RAIL_ETA[routed.rail],
    rail: railStages,
    kind: "crosschain",
    railName: RAIL_LABEL[routed.rail],
    railReason: routed.reason,
    exec: {
      rail: routed.rail,
      action,
      fromChain: from.chain,
      fromToken: from.tokenSymbol as QuoteExec["fromToken"],
      fromAmount: from.amount,
      toChain: to.chain,
      toToken: to.tokenSymbol as QuoteExec["toToken"],
      fiatCurrency: null,
      recipient: null,
    },
  };
}

function prettyChainId(id: string): string {
  return id
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

// ---------------------------------------------------------------------------
// Inline icons — kept here to avoid pulling stroke colours from the light
// shared icon set.
// ---------------------------------------------------------------------------

function ChevronDown({
  size = 14,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function FlipIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 4v16" />
      <path d="M3 8l4-4 4 4" />
      <path d="M17 20V4" />
      <path d="M21 16l-4 4-4-4" />
    </svg>
  );
}

function SettingsIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function BoltIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
    </svg>
  );
}

function ShieldIcon({ size = 11 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function GasIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18" />
      <path d="M1 22h16" />
      <path d="M15 8h3a2 2 0 0 1 2 2v8a1 1 0 0 0 2 0V9.83a2 2 0 0 0-.59-1.42L19 5" />
    </svg>
  );
}

function AlertIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.3 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function WalletIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-1" />
      <path d="M16 12h5v4h-5a2 2 0 0 1 0-4z" />
    </svg>
  );
}

// TokenGlyph is exported by TokenChainPicker but unused locally; re-exporting
// here would shadow it. Leave as-is.
export { TokenGlyph };
