// icons.tsx — minimal stroke icons + abstract chain glyphs + currency badges
import React from "react";

type IconProps = { size?: number };
type ArrowProps = { size?: number; rotate?: number };
type DotProps = { size?: number; color?: string };

export const Icon = {
  Logo: ({ size = 22 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden>
      <path
        d="M9 4h6a5 5 0 0 1 0 10H13a5 5 0 0 0 0 10h6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="9" cy="9" r="2.2" fill="currentColor" />
      <circle cx="19" cy="19" r="2.2" fill="currentColor" />
    </svg>
  ),
  Arrow: ({ size = 14, rotate = 0 }: ArrowProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      style={{ transform: `rotate(${rotate}deg)` }}
      fill="none"
      aria-hidden
    >
      <path
        d="M4 12L12 4M12 4H6M12 4V10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  ArrowRight: ({ size = 14 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 8h10M9 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Check: ({ size = 14 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 8.5l3 3 7-7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Dot: ({ size = 6, color = "currentColor" }: DotProps) => (
    <svg width={size} height={size} viewBox="0 0 6 6" aria-hidden>
      <circle cx="3" cy="3" r="3" fill={color} />
    </svg>
  ),
  Send: ({ size = 16 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2 14V2l12 6-12 6zM2 8h7"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  ),
  Receive: ({ size = 16 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 2v10M4 8l4 4 4-4M2 14h12"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  History: ({ size = 16 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 4v4l3 2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  ),
  Book: ({ size = 16 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 3h7a3 3 0 0 1 3 3v8a1 1 0 0 1-1 1H6a3 3 0 0 1-3-3V3z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M3 12a2 2 0 0 1 2-2h8" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  ),
  Settings: ({ size = 16 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 1.5v2M8 12.5v2M2.6 4.5l1.7 1M11.7 10.5l1.7 1M2.6 11.5l1.7-1M11.7 5.5l1.7-1M1.5 8h2M12.5 8h2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  ),
  Sparkle: ({ size = 14 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 1.5l1.4 4.1L13.5 7 9.4 8.4 8 12.5 6.6 8.4 2.5 7l4.1-1.4L8 1.5z"
        fill="currentColor"
      />
      <circle cx="13.2" cy="2.8" r="0.7" fill="currentColor" />
    </svg>
  ),
  Copy: ({ size = 13 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect
        x="3"
        y="3"
        width="8"
        height="10"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M6 3V2.5A1.5 1.5 0 0 1 7.5 1h5A1.5 1.5 0 0 1 14 2.5v8A1.5 1.5 0 0 1 12.5 12H12"
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </svg>
  ),
  Globe: ({ size = 14 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M2 8h12M8 2c2 2 2 10 0 12M8 2C6 4 6 12 8 14"
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </svg>
  ),
  Shield: ({ size = 14 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 1l5 2v5c0 3-2 5-5 7-3-2-5-4-5-7V3l5-2z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Search: ({ size = 14 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M10.5 10.5L14 14"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  ),
  Wallet: ({ size = 14 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect
        x="2"
        y="4"
        width="12"
        height="9"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path d="M2 6h12" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="11" cy="9.5" r="1" fill="currentColor" />
    </svg>
  ),
  Edit: ({ size = 13 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M11.5 2.5l2 2-8 8H3.5v-2l8-8zM10 4l2 2"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Plus: ({ size = 13 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 3v10M3 8h10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
  Spinner: ({ size = 14 }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      style={{ animation: "spin .8s linear infinite" }}
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeOpacity="0.2"
        strokeWidth="2"
      />
      <path
        d="M14 8a6 6 0 0 0-6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  ),
  ChevDown: ({ size = 12 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
};

/* Chain glyphs — abstract typographic monograms inside a soft chip.
   Intentionally not pictorial brand marks. */
function chainGlyph(label: string, accent = "currentColor") {
  const Glyph: React.FC<IconProps> = ({ size = 22 }) => (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--bg-soft)",
        border: "1px solid var(--line)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Geist Mono, ui-monospace, monospace",
        fontSize: Math.max(8, size * 0.36),
        fontWeight: 600,
        color: accent === "currentColor" ? "var(--fg-soft)" : accent,
        letterSpacing: 0,
      }}
    >
      {label}
    </span>
  );
  Glyph.displayName = `ChainGlyph(${label})`;
  return Glyph;
}

export const Chain: Record<string, React.FC<IconProps>> = {
  ETH: chainGlyph("ETH"),
  BASE: chainGlyph("BS"),
  SOL: chainGlyph("SOL"),
  BNB: chainGlyph("BNB"),
  ARB: chainGlyph("ARB"),
  OP: chainGlyph("OP"),
  POLY: chainGlyph("POL"),
  TRON: chainGlyph("TRX"),
  BTC: chainGlyph("BTC"),
  STRK: chainGlyph("STK"),
  USDC: chainGlyph("USDC", "var(--accent)"),
  USDT: chainGlyph("USDT", "var(--ok)"),
};

/* Currency / payout-method badge — small typographic chip */
export function Currency({ code, size = 22 }: { code: string; size?: number }) {
  return (
    <span
      style={{
        minWidth: size,
        height: size,
        padding: "0 6px",
        borderRadius: "999px",
        background: "var(--bg-soft)",
        border: "1px solid var(--line)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Geist Mono, ui-monospace, monospace",
        fontSize: Math.max(9, size * 0.36),
        fontWeight: 600,
        color: "var(--fg-soft)",
      }}
    >
      {code}
    </span>
  );
}

/* Token + chain pair (shows token glyph with chain badge attached) */
export function TokenOnChain({
  token,
  chain,
  size = 28,
}: {
  token: string;
  chain: string;
  size?: number;
}) {
  const Tok = Chain[token] || Chain.USDC;
  const Chn = Chain[chain] || Chain.ETH;
  const small = Math.round(size * 0.55);
  return (
    <span
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "inline-block",
      }}
    >
      <Tok size={size} />
      <span style={{ position: "absolute", right: -2, bottom: -2 }}>
        <Chn size={small} />
      </span>
    </span>
  );
}
