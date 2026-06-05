"use client";

/**
 * ARC TokenPicker — modal selector for chain + token, used by SwapForm.
 *
 * Two surfaces:
 *  - `TokenPill`: the compact pill the SwapForm renders inside a pane
 *    (logo + symbol + chevron). Click it to open the modal.
 *  - `TokenPickerModal`: full-screen overlay with search, chain-filter
 *    chips, and the LiFi-backed token list.
 *
 * Data source: src/lib/lifi.ts (LiFi catalog filtered to ACTIVE_CHAINS).
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  loadChains,
  loadTokens,
  type RegistryChain,
  type RegistryToken,
} from "@/lib/lifi";
import type { ChainId } from "@/config/network";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TokenChainSelection {
  chain: ChainId;
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
  amount: string;
}

// ---------------------------------------------------------------------------
// TokenGlyph — circular symbol badge + chain corner pip
// ---------------------------------------------------------------------------

const GLYPH_PALETTE: ReadonlyArray<readonly [string, string]> = [
  ["#5B8CFF", "#FFFFFF"],
  ["#A47CFF", "#FFFFFF"],
  ["#4ECDC4", "#06081A"],
  ["#FFB661", "#06081A"],
  ["#FF6BD9", "#06081A"],
  ["#5FE3A8", "#06081A"],
];

function hashColor(seed: string): readonly [string, string] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return GLYPH_PALETTE[Math.abs(h) % GLYPH_PALETTE.length];
}

/** Stable colour pip per chain when LiFi has no logo (testnet chains). */
function chainTint(chainId: string): string {
  const map: Record<string, string> = {
    ethereum: "#627eea",
    base: "#0052ff",
    arbitrum: "#28a0f0",
    optimism: "#ff0420",
    polygon: "#8247e5",
    avalanche: "#e84142",
    bnb: "#f0b90b",
    solana: "#9945ff",
    starknet: "#ec796b",
  };
  // Testnets fall through to the mainnet tint of the same family.
  const family = chainId.replace(/-sepolia$|-amoy$|-fuji$|-devnet$/, "");
  return map[family] ?? "#5b8cff";
}

export function TokenGlyph({
  symbol,
  size = 24,
  logoURI,
  chain,
}: {
  symbol: string;
  size?: number;
  logoURI?: string;
  chain?: RegistryChain;
}) {
  const initials =
    symbol.length > 4 ? symbol.slice(0, 3) : symbol.slice(0, symbol.length);
  const [bg, fg] = useMemo(() => hashColor(symbol || "?"), [symbol]);
  const fontSize = symbol.length > 4 ? size * 0.32 : size * 0.42;
  const chainSize = Math.max(10, Math.round(size * 0.42));
  return (
    <div
      className="arc-glyph"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {logoURI ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoURI}
          alt=""
          className="arc-glyph-img"
          width={size}
          height={size}
          style={{ width: size, height: size, display: "block" }}
        />
      ) : (
        <div
          className="arc-glyph-fallback"
          style={{ width: size, height: size, fontSize, background: bg, color: fg }}
        >
          {initials}
        </div>
      )}
      {chain && (
        <div
          className="arc-glyph-chain"
          style={{
            width: chainSize,
            height: chainSize,
            // Tints the pip with a chain-derived colour so testnet chains
            // (where LiFi has no logo) still read as distinct, not generic.
            // On the light card the logo-backed pip carves against the white
            // surface rather than the old dark-navy fill.
            background: chain.logoURI ? "var(--bg-elev)" : chainTint(chain.id),
            fontSize: Math.round(size * 0.26),
            lineHeight: 1,
          }}
          title={chain.name}
        >
          {chain.logoURI ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={chain.logoURI} alt="" />
          ) : (
            chain.name.slice(0, 1).toUpperCase()
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TokenPill — the inline button rendered in a swap pane
// ---------------------------------------------------------------------------

export function TokenPill({
  value,
  registryToken,
  registryChain,
  onClick,
}: {
  value: TokenChainSelection;
  registryToken?: RegistryToken;
  registryChain?: RegistryChain;
  onClick: () => void;
}) {
  const symbol = value.tokenSymbol || "Pick";
  return (
    <button className="arc-token-btn" onClick={onClick} type="button">
      <TokenGlyph
        symbol={symbol}
        size={28}
        logoURI={registryToken?.logoURI}
        chain={registryChain}
      />
      <span className="arc-tb-sym">{symbol}</span>
      <ChevronDown size={14} className="arc-tb-pick" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// TokenPickerModal
// ---------------------------------------------------------------------------

export function TokenPickerModal({
  open,
  mode,
  onClose,
  onPick,
}: {
  open: boolean;
  mode: "from" | "to";
  onClose: () => void;
  onPick: (next: TokenChainSelection) => void;
}) {
  const [chains, setChains] = useState<RegistryChain[]>([]);
  const [tokens, setTokens] = useState<Record<string, RegistryToken[]>>({});
  const [chainFilter, setChainFilter] = useState<ChainId | "all">("all");
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadChains().then(setChains).catch(() => setChains([]));
    loadTokens().then(setTokens).catch(() => setTokens({}));
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setChainFilter("all");
      setTimeout(() => searchRef.current?.focus(), 80);
    }
  }, [open]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const pool =
      chainFilter === "all"
        ? Object.entries(tokens).flatMap(([chain, list]) =>
            list.map((t) => ({ ...t, chain: chain as ChainId }))
          )
        : (tokens[chainFilter] ?? []).map((t) => ({
            ...t,
            chain: chainFilter as ChainId,
          }));
    const ql = q.trim().toLowerCase();
    const rows = ql
      ? pool.filter(
          (t) =>
            t.symbol.toLowerCase().includes(ql) ||
            t.name.toLowerCase().includes(ql) ||
            t.address.toLowerCase() === ql
        )
      : pool;
    return rows.slice(0, 300);
  }, [tokens, chainFilter, q]);

  const chainById = useMemo(() => {
    const map = new Map<string, RegistryChain>();
    for (const c of chains) map.set(c.id, c);
    return map;
  }, [chains]);

  if (!open) return null;

  return (
    <div className="arc-root">
      <div className="arc-modal-overlay" onMouseDown={onClose}>
        <div
          className="arc-modal"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="arc-tp-head">
            <div className="arc-tp-title">
              Select token{" "}
              <span className="arc-tp-sub">
                {mode === "from" ? "to swap from" : "to receive"}
              </span>
            </div>
            <button
              className="arc-icon-btn"
              onClick={onClose}
              aria-label="Close"
              type="button"
            >
              <CloseIcon />
            </button>
          </div>

          <div className="arc-tp-search">
            <SearchIcon />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, symbol, or paste address"
            />
            <kbd>esc</kbd>
          </div>

          <div className="arc-tp-chains">
            <button
              type="button"
              className={
                "arc-chain-chip" + (chainFilter === "all" ? " active" : "")
              }
              onClick={() => setChainFilter("all")}
            >
              <span className="arc-chain-chip-dot all" />
              All chains
            </button>
            {chains.map((c) => (
              <button
                key={c.id}
                type="button"
                className={
                  "arc-chain-chip" + (chainFilter === c.id ? " active" : "")
                }
                onClick={() => setChainFilter(c.id)}
                title={c.name}
              >
                {c.logoURI ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.logoURI}
                    alt=""
                    width={14}
                    height={14}
                    style={{ borderRadius: "50%" }}
                  />
                ) : (
                  <span
                    className="arc-chain-chip-dot"
                    style={{ background: "#5b8cff" }}
                  />
                )}
                {c.name}
              </button>
            ))}
          </div>

          <div className="arc-tp-list-head">
            <span>Token</span>
            <span>Network</span>
          </div>

          <div className="arc-tp-list">
            {filtered.length === 0 ? (
              <div className="arc-tp-empty">
                <SearchIcon size={20} />
                <div>
                  No tokens match &ldquo;<b>{q}</b>&rdquo;
                </div>
                <div className="dim">
                  Try a different chain or paste a contract address
                </div>
              </div>
            ) : (
              filtered.map((t) => {
                const chain = chainById.get(t.chain);
                return (
                  <button
                    type="button"
                    key={`${t.chain}-${t.address}`}
                    className="arc-tp-row"
                    onClick={() =>
                      onPick({
                        chain: t.chain as ChainId,
                        tokenAddress: t.address,
                        tokenSymbol: t.symbol,
                        tokenDecimals: t.decimals,
                        amount: "",
                      })
                    }
                  >
                    <TokenGlyph
                      symbol={t.symbol}
                      size={36}
                      logoURI={t.logoURI}
                      chain={chain}
                    />
                    <div className="arc-tp-row-name">
                      <span className="arc-tp-row-sym">{t.symbol}</span>
                      <span className="arc-tp-row-meta">
                        {t.name}
                        {chain ? ` · on ${chain.name}` : ""}
                      </span>
                    </div>
                    <div
                      className="arc-tp-row-meta"
                      style={{
                        textAlign: "right",
                        fontFamily: "JetBrains Mono, monospace",
                        fontSize: 11,
                      }}
                    >
                      {chain?.name ?? t.chain}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline icons — kept local so the picker has zero dep on the shared
// `icons.tsx` module that uses the light-theme stroke colour.
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

function SearchIcon({ size = 16 }: { size?: number }) {
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
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

function CloseIcon({ size = 16 }: { size?: number }) {
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
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
