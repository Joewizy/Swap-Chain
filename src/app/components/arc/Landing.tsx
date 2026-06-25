"use client";

// Landing.tsx — global fintech landing.
// Sections: top bar · hero (with browser/app mockup) · one-sentence-route examples
// · routes without plumbing (4 neutral rail cards) · built for local settlement
// (payout methods) · slim reassurance row · footer.

import "flag-icons/css/flag-icons.min.css";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icons";
import {
  NetworkEthereum,
  NetworkBase,
  NetworkArbitrumOne,
  NetworkOptimism,
  NetworkPolygon,
  NetworkSolana,
  NetworkBinanceSmartChain,
  NetworkTron,
  NetworkBitcoin,
  NetworkStarknet,
  TokenUSDC,
  TokenUSDT,
} from "@web3icons/react";

type OpenApp = { onOpenApp: () => void };
type W3Icon = React.ElementType;
type ConvSide = { label: string; Icon?: W3Icon; flag?: string; img?: string };

function PairSideIcon({ side, size = 22 }: { side: ConvSide; size?: number }) {
  const I = side.Icon;
  return (
    <span className="hero-pair-icon" style={{ width: size, height: size }}>
      {I ? (
        <I variant="branded" size={size} />
      ) : side.img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={side.img} alt="" width={size} height={size} />
      ) : (
        <span
          className={`fi fis fi-${side.flag}`}
          style={{ width: size, height: size, borderRadius: "50%" }}
          aria-hidden
        />
      )}
    </span>
  );
}

function HeroPairPill({ from, to }: { from: ConvSide; to: ConvSide }) {
  return (
    <div className="hero-pair-pill">
      <span className="hero-pair-side">
        <PairSideIcon side={from} />
        <span className="hero-pair-label">{from.label}</span>
      </span>
      <span className="hero-pair-swap" aria-hidden>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path
            d="M3 6.5h10.5M11.5 4.5L14 6.5l-2.5 2M15 11.5H4.5M6.5 13.5L4 11.5l2.5-2"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="hero-pair-side">
        <PairSideIcon side={to} />
        <span className="hero-pair-label">{to.label}</span>
      </span>
    </div>
  );
}

// Nigeria-led corridor rotation for the hero pill (TOKEN ↔ FIAT).
const HERO_PAIRS: [ConvSide, ConvSide][] = [
  [{ label: "USDT", Icon: TokenUSDT }, { label: "NGN", flag: "ng" }],
  [{ label: "USDC", Icon: TokenUSDC }, { label: "NGN", flag: "ng" }],
  [{ label: "cNGN", img: "/tokens/cngn.png" }, { label: "NGN", flag: "ng" }],
  [{ label: "USDT", Icon: TokenUSDT }, { label: "KES", flag: "ke" }],
];

/* One cycling conversion pill — gentle crossfade, pauses on hover. */
function HeroAssets() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return; // reduced motion → stay on USDT ↔ NGN
    }
    const id = setInterval(
      () => setI((p) => (p + 1) % HERO_PAIRS.length),
      3200,
    );
    return () => clearInterval(id);
  }, [paused]);
  const [from, to] = HERO_PAIRS[i];
  return (
    <div
      className="hero-pairs"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div key={i} className="hero-pair-fade">
        <HeroPairPill from={from} to={to} />
      </div>
    </div>
  );
}

/* ───────────────────── TOP BAR ────────────────────── */
function TopBar({ onOpenApp }: OpenApp) {
  return (
    <nav
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 5,
        padding: "20px var(--pad-page)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <a
        href="#top"
        className="row center gap-2"
        style={{ fontSize: 14, fontWeight: 500 }}
      >
        <Icon.Logo size={20} />
        <span>Railglide</span>
      </a>
      <div
        className="row center gap-2"
        style={{ color: "var(--fg-soft)", fontSize: 13 }}
      >
        <a href="#routes" className="l-hide-mobile" style={{ padding: "8px 12px" }}>
          Routes
        </a>
        <a
          href="#settlement"
          className="l-hide-mobile"
          style={{ padding: "8px 12px" }}
        >
          Settlement
        </a>
        <button
          className="btn btn-primary btn-sm"
          onClick={onOpenApp}
          style={{ marginLeft: 4 }}
        >
          Launch app
        </button>
      </div>
    </nav>
  );
}

/* ───────────────────── HERO ────────────────────── */
function Hero({ onOpenApp }: OpenApp) {
  return (
    <section
      id="top"
      style={{ position: "relative", paddingTop: 132, paddingBottom: 96 }}
    >
      <div className="blob-hero" aria-hidden />
      <div className="container" style={{ position: "relative", zIndex: 1 }}>
        <div className="l-hero">
          {/* left: copy */}
          <div>
            <h1
              className="display"
              style={{
                fontSize: "clamp(36px, 4.6vw, 56px)",
                lineHeight: 1.08,
                letterSpacing: "-0.02em",
              }}
            >
              Crypto and cash made easy
            </h1>
            <p
              style={{
                fontSize: 17,
                color: "var(--fg-soft)",
                lineHeight: 1.55,
                maxWidth: "44ch",
                marginTop: 22,
              }}
            >
              Buy stablecoins, swap tokens, or cash out directly to your bank
              or mobile wallet.
            </p>
            <HeroAssets />
            <div style={{ marginTop: 28 }}>
              <button className="btn btn-primary btn-big" onClick={onOpenApp}>
                Launch app <Icon.ArrowRight />
              </button>
            </div>
            <div
              className="row center gap-4"
              style={{ marginTop: 28, color: "var(--fg-mute)", fontSize: 12 }}
            >
              <span className="row center gap-2">
                <Icon.Shield /> Stablecoin settlement
              </span>
            </div>
          </div>

          {/* right: app mockup */}
          <HeroMockup />
        </div>
      </div>
    </section>
  );
}

/* Polished browser/app mockup — NL command + assistant response. */
function HeroMockup() {
  const [typed, setTyped] = useState("");
  const [showReply, setShowReply] = useState(false);
  const cmd = "Cash out 200 USDC to GTBank";

  useEffect(() => {
    let cancel = false;
    setTyped("");
    setShowReply(false);
    let i = 0;
    const id = setInterval(() => {
      if (cancel) return;
      i++;
      setTyped(cmd.slice(0, i));
      if (i >= cmd.length) {
        clearInterval(id);
        setTimeout(() => !cancel && setShowReply(true), 400);
      }
    }, 50);
    // loop
    const restart = setInterval(() => {
      if (cancel) return;
      setShowReply(false);
      setTyped("");
      let j = 0;
      const id2 = setInterval(() => {
        if (cancel) return;
        j++;
        setTyped(cmd.slice(0, j));
        if (j >= cmd.length) {
          clearInterval(id2);
          setTimeout(() => !cancel && setShowReply(true), 400);
        }
      }, 50);
    }, 8500);
    return () => {
      cancel = true;
      clearInterval(id);
      clearInterval(restart);
    };
  }, []);

  return (
    <div style={{ position: "relative" }}>
      {/* soft outer shadow + faint backdrop */}
      <div
        className="card-lg"
        style={{
          position: "relative",
          boxShadow: "var(--shadow-2)",
          overflow: "hidden",
        }}
      >
        {/* command field */}
        <div style={{ padding: "clamp(20px, 5vw, 26px) clamp(18px, 5vw, 24px) 18px" }}>
          <span className="eyebrow">What would you like to do?</span>
          <div
            style={{
              marginTop: 12,
              minHeight: 44,
              fontSize: "clamp(18px, 5.2vw, 24px)",
              fontWeight: 500,
              letterSpacing: "-0.012em",
              color: "var(--fg)",
              lineHeight: 1.3,
            }}
          >
            <span className={showReply ? "" : "cursor-blink"}>{typed}</span>
          </div>
        </div>

        {/* assistant reply */}
        <div
          style={{
            margin: "0 clamp(18px, 5vw, 24px) 18px",
            padding: 16,
            borderRadius: 12,
            background: "var(--bg-soft)",
            border: "1px solid var(--line)",
            opacity: showReply ? 1 : 0,
            transform: showReply ? "translateY(0)" : "translateY(4px)",
            transition: "opacity .35s var(--ease), transform .35s var(--ease)",
          }}
        >
          <div className="row center gap-2" style={{ marginBottom: 10 }}>
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: "var(--accent)",
                color: "var(--accent-fg)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon.Sparkle size={10} />
            </span>
            <span
              className="font-mono"
              style={{
                fontSize: 10.5,
                letterSpacing: 0.08,
                color: "var(--fg-mute)",
                textTransform: "uppercase",
              }}
            >
              Assistant
            </span>
          </div>
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.55,
              color: "var(--fg-soft)",
              margin: 0,
            }}
          >
            Got it —{" "}
            <strong style={{ color: "var(--fg)" }}>
              cashing out USDC to GTBank.
            </strong>{" "}
            No swap needed. Confirm the amount and rate on the next screen.
          </p>
        </div>

        {/* quick parse summary */}
        <div style={{ padding: "0 clamp(18px, 5vw, 24px) 22px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
              gap: 12,
              opacity: showReply ? 1 : 0.35,
              transition: "opacity .35s var(--ease)",
            }}
          >
            <ParseTile label="You cash out" value="200 USDC" sub="Base" />
            <ParseTile
              label="You receive ≈"
              value="₦318,420"
              sub="GTBank · ···· 4429"
              accent
            />
          </div>
        </div>

        <div
          className="row center"
          style={{
            padding: "12px clamp(18px, 5vw, 24px)",
            background: "var(--bg-sunk)",
            borderTop: "1px solid var(--line)",
            fontSize: 11,
            color: "var(--fg-mute)",
            flexWrap: "wrap",
            justifyContent: "flex-start",
            gap: "6px 14px",
          }}
        >
          <span className="font-mono">FEE ≈ $0.55</span>
          <span className="font-mono">ARRIVES ≈ 2 min</span>
          <span className="chip" style={{ padding: "2px 8px", fontSize: 10 }}>
            rate set when you confirm
          </span>
        </div>
      </div>
    </div>
  );
}

function ParseTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        padding: "12px 14px",
        background: "var(--bg-soft)",
        border: "1px solid var(--line)",
        borderRadius: 10,
      }}
    >
      <span className="eyebrow" style={{ fontSize: 10 }}>
        {label}
      </span>
      <div
        className="font-mono tabular"
        style={{
          marginTop: 6,
          fontSize: 18,
          fontWeight: 500,
          color: accent ? "var(--accent)" : "var(--fg)",
        }}
      >
        {value}
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
        {sub}
      </div>
    </div>
  );
}

/* ───────────────────── EXAMPLE SENTENCE STRIP (slim) ────── */
function SentenceStrip() {
  const examples = [
    "Cash out 200 USDC to GTBank",
    "Send $500 to Tunde's Opay",
    "Swap XRP for USDC on Base",
    "How can I buy USDC on Base?",
  ];
  return (
    <section style={{ padding: "52px 0", borderTop: "1px solid var(--line)" }}>
      <div className="container" style={{ textAlign: "center" }}>
        <span className="eyebrow">Just describe it</span>
        <div
          className="row center wrap"
          style={{ gap: 10, justifyContent: "center", marginTop: 18 }}
        >
          {examples.map((text, i) => (
            <span
              key={i}
              style={{
                padding: "9px 16px",
                borderRadius: 999,
                background: "var(--bg-elev)",
                boxShadow:
                  "inset 0 0 0 1px rgba(20,18,14,.06), 0 2px 8px -5px rgba(20,18,14,.18)",
                fontSize: 13.5,
                color: "var(--fg-soft)",
                whiteSpace: "nowrap",
              }}
            >
              “{text}”
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────── ROUTES WITHOUT PLUMBING (4 cards) ─ */
function RailCards() {
  const rails = [
    {
      label: "Buy",
      title: "Buy stablecoins.",
      copy: "Pay with fiat from your bank and receive stablecoins in your wallet.",
      glyph: (
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M12 3v9" />
          <path d="M8.5 8.5 12 12l3.5-3.5" />
          <path d="M4 14v3.5A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V14" />
        </svg>
      ),
    },
    {
      label: "Sell",
      title: "Cash out.",
      copy: "Sell stablecoins and receive fiat in your bank or mobile money account.",
      glyph: (
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M12 12V3" />
          <path d="M8.5 6.5 12 3l3.5 3.5" />
          <path d="M4 14v3.5A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V14" />
        </svg>
      ),
    },
    {
      label: "Swap",
      title: "Swap tokens.",
      copy: "Swap any token across chains — or convert to USDC or USDT before you cash out.",
      glyph: (
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M4 9h13" />
          <path d="M14 6l3 3-3 3" />
          <path d="M20 15H7" />
          <path d="M10 12l-3 3 3 3" />
        </svg>
      ),
    },
  ];

  return (
    <section
      id="routes"
      style={{ padding: "96px 0", borderTop: "1px solid var(--line)" }}
    >
      <div className="container">
        <div style={{ marginBottom: 36, maxWidth: "60ch" }}>
          <span className="eyebrow">How it works</span>
          <h2
            style={{
              fontSize: "var(--t-h1)",
              marginTop: 12,
              lineHeight: 1.05,
              letterSpacing: "-0.025em",
              fontWeight: 500,
              maxWidth: "20ch",
            }}
          >
            You choose.
          </h2>
        </div>

        <div className="rail-grid">
          {rails.map((r) => (
            <div key={r.label} className="card feat-card rail-card">
              <div className="rail-card-head">
                <span className="icon-tile">{r.glyph}</span>
                <span className="chip chip-inline" style={{ fontSize: 10 }}>
                  {r.label}
                </span>
              </div>
              <h3
                style={{
                  fontSize: 20,
                  fontWeight: 500,
                  letterSpacing: "-0.015em",
                  lineHeight: 1.25,
                }}
              >
                {r.title}
              </h3>
              <p
                className="muted"
                style={{ fontSize: 13.5, marginTop: 8, lineHeight: 1.55 }}
              >
                {r.copy}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────── BUILT FOR LOCAL SETTLEMENT ──────── */
function Settlement() {
  const methods = [
    {
      title: "Bank account",
      sub: "Direct deposit to your bank account.",
      glyph: (
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M3 9.5 12 4l9 5.5" />
          <path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8" />
          <path d="M3.5 21h17" />
        </svg>
      ),
    },
    {
      title: "Mobile money",
      sub: "Phone-number payouts.",
      glyph: (
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
          <path d="M10.5 18.5h3" />
          <path d="M12 13.5V8" />
          <path d="M9.8 10.2 12 8l2.2 2.2" />
        </svg>
      ),
    },
    {
      title: "Crypto wallet",
      sub: "USDC, USDT, or cNGN on your network.",
      glyph: (
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <rect x="3.5" y="6" width="17" height="13" rx="3" />
          <path d="M14.5 11.5h6v4h-6a2 2 0 0 1 0-4Z" />
          <circle cx="16.4" cy="13.5" r="0.9" fill="currentColor" stroke="none" />
        </svg>
      ),
    },
  ];
  return (
    <section
      id="settlement"
      style={{ padding: "96px 0", borderTop: "1px solid var(--line)" }}
    >
      <div className="container">
        <div style={{ marginBottom: 36, maxWidth: "60ch" }}>
          <span className="eyebrow">Settlement</span>
          <h2
            style={{
              fontSize: "var(--t-h1)",
              marginTop: 12,
              lineHeight: 1.05,
              letterSpacing: "-0.025em",
              fontWeight: 500,
              maxWidth: "16ch",
            }}
          >
            Where your money lands.
          </h2>
        </div>

        <div className="settle-grid">
          {methods.map((m) => (
            <article
              key={m.title}
              className="card feat-card"
              style={{
                padding: 22,
                display: "flex",
                flexDirection: "column",
                gap: 18,
                minWidth: 0,
              }}
            >
              <span className="icon-tile">{m.glyph}</span>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 500 }}>{m.title}</h3>
                <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  {m.sub}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────── SUPPORTED NETWORKS (marquee) ─ */
function NetworksMarquee() {
  // Real branded chain logos via @web3icons/react.
  const chains: { name: string; Icon: W3Icon }[] = [
    { name: "Ethereum", Icon: NetworkEthereum },
    { name: "Base", Icon: NetworkBase },
    { name: "Arbitrum", Icon: NetworkArbitrumOne },
    { name: "Optimism", Icon: NetworkOptimism },
    { name: "Polygon", Icon: NetworkPolygon },
    { name: "Solana", Icon: NetworkSolana },
    { name: "BNB Chain", Icon: NetworkBinanceSmartChain },
    { name: "Tron", Icon: NetworkTron },
    { name: "Bitcoin", Icon: NetworkBitcoin },
    { name: "Starknet", Icon: NetworkStarknet },
  ];

  return (
    <section
      style={{ position: "relative", padding: "76px 0", borderTop: "1px solid var(--line)" }}
    >
      <div className="net-glow" aria-hidden />
      <div
        className="narrow"
        style={{ position: "relative", zIndex: 1, textAlign: "center", marginBottom: 40 }}
      >
        <span className="eyebrow">Supported networks</span>
        <h2
          style={{
            fontSize: 25,
            fontWeight: 500,
            letterSpacing: "-0.02em",
            lineHeight: 1.3,
            marginTop: 12,
            maxWidth: "20ch",
            marginInline: "auto",
          }}
        >
          Accept value from anywhere — crypto or cash, instantly.
        </h2>
      </div>

      {/* chains — large bare floating logos */}
      <div className="marquee chain-marquee" aria-hidden>
        <div
          className="marquee-track chain-track"
          style={{ ["--marquee-dur" as string]: "52s" }}
        >
          {[...chains, ...chains].map(({ name, Icon }, i) => (
            <span key={i} className="chain-logo" title={name}>
              <Icon variant="branded" size={46} />
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────── BIG CTA ─────────────────────────── */
function FinalCTA({ onOpenApp }: OpenApp) {
  return (
    <section style={{ padding: "120px 0 80px" }}>
      <div className="narrow" style={{ textAlign: "center" }}>
        <h2
          className="display"
          style={{
            fontSize: "calc(var(--t-display) * 1.12)",
            lineHeight: 1.0,
            letterSpacing: "-0.015em",
            maxWidth: "16ch",
            margin: "0 auto",
          }}
        >
          Stop bridging.
          <br />
          <em>Buy or cash out.</em>
        </h2>
        <div style={{ marginTop: 28, textAlign: "center" }}>
          <button className="btn btn-primary btn-big" onClick={onOpenApp}>
            Launch app <Icon.ArrowRight />
          </button>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────── FOOTER ──────────────────────────── */
function Footer() {
  return (
    <footer style={{ borderTop: "1px solid var(--line)" }}>
      <div className="container footer-inner">
        <div className="row center gap-3">
          <Icon.Logo size={16} />
          <span>© 2026 Railglide</span>
        </div>
        <div className="footer-links">
          <a
            href="https://x.com/Railglideapp"
            target="_blank"
            rel="noopener noreferrer"
          >
            X
          </a>
          <a href="#" onClick={(e) => e.preventDefault()}>
            Privacy
          </a>
          <a href="#" onClick={(e) => e.preventDefault()}>
            Terms
          </a>
        </div>
      </div>
      {/* technical providers footer — small, monospace, end of page */}
      <div
        className="container"
        style={{
          padding: "12px 0 28px",
          fontSize: 10.5,
          color: "var(--fg-faint)",
          letterSpacing: 0.04,
        }}
      >
      </div>
    </footer>
  );
}

/* ───────────────────── LANDING ROOT ────────────────────── */
export default function Landing() {
  const router = useRouter();
  const onOpenApp = () => router.push("/swap");
  return (
    <div style={{ position: "relative", minHeight: "100vh" }}>
      <TopBar onOpenApp={onOpenApp} />
      <Hero onOpenApp={onOpenApp} />
      <SentenceStrip />
      <RailCards />
      <Settlement />
      <NetworksMarquee />
      <FinalCTA onOpenApp={onOpenApp} />
      <Footer />
    </div>
  );
}
