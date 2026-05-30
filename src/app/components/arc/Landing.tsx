"use client";

// Landing.tsx — global fintech landing.
// Sections: top bar · hero (with browser/app mockup) · one-sentence-route examples
// · routes without plumbing (4 neutral rail cards) · built for local settlement
// (payout methods) · slim reassurance row · footer.

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, Chain } from "./icons";

type OpenApp = { onOpenApp: () => void };

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
        <span>Swap&nbsp;Chain</span>
      </a>
      <div
        className="row center gap-2"
        style={{ color: "var(--fg-soft)", fontSize: 13 }}
      >
        <a href="#routes" style={{ padding: "8px 12px" }}>
          Routes
        </a>
        <a href="#settlement" style={{ padding: "8px 12px" }}>
          Settlement
        </a>
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          className="row center gap-1"
          style={{ padding: "8px 12px" }}
        >
          Docs <Icon.Arrow size={11} />
        </a>
        <button
          className="btn btn-primary btn-sm"
          onClick={onOpenApp}
          style={{ marginLeft: 4 }}
        >
          Try the demo
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
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.05fr) minmax(0, 1.1fr)",
            gap: 56,
            alignItems: "center",
          }}
        >
          {/* left: copy */}
          <div>
            <span className="chip chip-accent" style={{ marginBottom: 22 }}>
              <Icon.Sparkle size={11} /> v0.9 · invite-only
            </span>
            <h1
              style={{
                fontSize: "var(--t-display)",
                lineHeight: 1.04,
                letterSpacing: "-0.03em",
                fontWeight: 500,
                maxWidth: "16ch",
              }}
            >
              Send money anywhere,
              <br />
              <span style={{ color: "var(--fg-mute)" }}>in plain English.</span>
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
              Tell Swap&nbsp;Chain what you want. Stablecoins from any chain can
              land in a local bank, mobile money account, another wallet, or
              another chain.
            </p>
            <div
              className="row gap-3"
              style={{ marginTop: 32, flexWrap: "wrap" }}
            >
              <button className="btn btn-primary btn-big" onClick={onOpenApp}>
                Try the demo <Icon.ArrowRight />
              </button>
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                className="btn btn-ghost btn-big"
              >
                Request access
              </a>
            </div>
            <div
              className="row center gap-4"
              style={{ marginTop: 28, color: "var(--fg-mute)", fontSize: 12 }}
            >
              <span className="row center gap-2">
                <Icon.Shield /> Stablecoin settlement
              </span>
              <span className="row center gap-2">
                <Icon.Globe /> 40+ destinations
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
        {/* chrome */}
        <div
          className="row center between"
          style={{
            padding: "11px 14px",
            borderBottom: "1px solid var(--line)",
            background: "var(--bg-soft)",
          }}
        >
          <span
            className="font-mono"
            style={{ fontSize: 11, color: "var(--fg-faint)" }}
          >
            swap-chain.app · /send
          </span>
          <span className="chip chip-inline" style={{ fontSize: 10 }}>
            demo
          </span>
        </div>

        {/* command field */}
        <div style={{ padding: "26px 24px 18px" }}>
          <span className="eyebrow">What would you like to do?</span>
          <div
            style={{
              marginTop: 12,
              minHeight: 44,
              fontSize: 24,
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
            margin: "0 24px 18px",
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
            Got it.{" "}
            <strong style={{ color: "var(--fg)" }}>
              USDC on Base → local payout to GTBank.
            </strong>{" "}
            Estimated arrival:{" "}
            <strong style={{ color: "var(--fg)" }}>2 minutes</strong>.
          </p>
        </div>

        {/* quick parse summary */}
        <div style={{ padding: "0 24px 22px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              opacity: showReply ? 1 : 0.35,
              transition: "opacity .35s var(--ease)",
            }}
          >
            <ParseTile label="You send" value="200.00 USDC" sub="Base" />
            <ParseTile
              label="Recipient gets"
              value="₦318,420"
              sub="GTBank · 0124 4429"
              accent
            />
          </div>
        </div>

        <div
          className="row between center"
          style={{
            padding: "12px 24px",
            background: "var(--bg-sunk)",
            borderTop: "1px solid var(--line)",
            fontSize: 11,
            color: "var(--fg-mute)",
          }}
        >
          <span className="font-mono">FEE $0.55</span>
          <span className="font-mono">ETA ≈ 2 min</span>
          <span
            className="chip chip-ok"
            style={{ padding: "2px 8px", fontSize: 10 }}
          >
            ● rate locked
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

/* ───────────────────── ONE SENTENCE BECOMES A ROUTE ────── */
function SentenceExamples() {
  const examples = [
    {
      text: "Send ₦50,000 to Tunde's Opay",
      kind: "Mobile money",
      out: "₦50,000 · Opay",
      eta: "≈ 45 s",
      from: "31.40 USDC · Base",
    },
    {
      text: "Cash out 200 USDC to GTBank",
      kind: "Bank account",
      out: "₦318,420 · GTBank",
      eta: "≈ 2 min",
      from: "200 USDC · Base",
    },
    {
      text: "Move 1.4 ETH from Base to Solana",
      kind: "Chain",
      out: "1.398 ETH · Solana",
      eta: "≈ 35 s",
      from: "1.4 ETH · Base",
    },
    {
      text: "Send 100 USDC to my EUR account",
      kind: "Bank account",
      out: "€92.04 · SEPA",
      eta: "≈ 4 min",
      from: "100 USDC · Base",
    },
  ];
  return (
    <section style={{ padding: "96px 0", borderTop: "1px solid var(--line)" }}>
      <div className="container">
        <div
          className="row between wrap"
          style={{ alignItems: "flex-end", gap: 24, marginBottom: 36 }}
        >
          <div>
            <span className="eyebrow">How it parses</span>
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
              One sentence becomes a route.
            </h2>
          </div>
          <p className="muted" style={{ maxWidth: "44ch", fontSize: 15 }}>
            Each example is something a real user types. The assistant resolves
            the destination type, currency, fee, and arrival time before you
            sign anything.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 16,
          }}
        >
          {examples.map((e, i) => (
            <article key={i} className="card" style={{ padding: 20 }}>
              <div className="row between center" style={{ gap: 10 }}>
                <span className="chip" style={{ fontSize: 10.5 }}>
                  {e.kind}
                </span>
                <Icon.Arrow size={14} />
              </div>
              <div
                style={{
                  marginTop: 16,
                  fontSize: 19,
                  fontWeight: 500,
                  lineHeight: 1.35,
                  letterSpacing: "-0.01em",
                }}
              >
                “{e.text}”
              </div>
              <div className="hr" style={{ margin: "18px 0" }} />
              <div className="row between center wrap" style={{ gap: 10 }}>
                <div className="col" style={{ gap: 2 }}>
                  <span className="eyebrow" style={{ fontSize: 10 }}>
                    From
                  </span>
                  <span
                    className="font-mono"
                    style={{ fontSize: 13, color: "var(--fg-soft)" }}
                  >
                    {e.from}
                  </span>
                </div>
                <Icon.ArrowRight size={14} />
                <div className="col" style={{ gap: 2, textAlign: "right" }}>
                  <span className="eyebrow" style={{ fontSize: 10 }}>
                    To
                  </span>
                  <span
                    className="font-mono tabular"
                    style={{ fontSize: 13, color: "var(--accent)" }}
                  >
                    {e.out}
                  </span>
                </div>
                <span
                  className="font-mono"
                  style={{
                    fontSize: 11,
                    color: "var(--fg-mute)",
                    marginLeft: "auto",
                  }}
                >
                  {e.eta}
                </span>
              </div>
            </article>
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
      label: "Deposit",
      title: "Move funds in.",
      copy: "Any chain, any token. Drop into a deposit address or pay from your connected wallet.",
      glyph: (
        <svg viewBox="0 0 32 32" width="28" height="28" fill="none" aria-hidden>
          <rect
            x="6"
            y="10"
            width="20"
            height="14"
            rx="3"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path
            d="M16 4v10m-3-3l3 3 3-3"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
    },
    {
      label: "Bridge",
      title: "Move across chains.",
      copy: "USDC ↔ USDC where it can. Behind one signature, never two.",
      glyph: (
        <svg viewBox="0 0 32 32" width="28" height="28" fill="none" aria-hidden>
          <circle
            cx="8"
            cy="16"
            r="4"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <circle
            cx="24"
            cy="16"
            r="4"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path
            d="M12 16h8"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      ),
    },
    {
      label: "Swap",
      title: "Convert tokens.",
      copy: "Routing across aggregators to land the asset the recipient actually wants.",
      glyph: (
        <svg viewBox="0 0 32 32" width="28" height="28" fill="none" aria-hidden>
          <path
            d="M6 12h18l-4-4M26 20H8l4 4"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
    },
    {
      label: "Payout",
      title: "Settle locally.",
      copy: "Bank account, mobile money, or another wallet — quoted before you sign.",
      glyph: (
        <svg viewBox="0 0 32 32" width="28" height="28" fill="none" aria-hidden>
          <rect
            x="4"
            y="10"
            width="24"
            height="14"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path
            d="M4 14h24M9 18h4"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
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
        <div
          className="row between wrap"
          style={{ alignItems: "flex-end", gap: 24, marginBottom: 36 }}
        >
          <div>
            <span className="eyebrow">The route</span>
            <h2
              style={{
                fontSize: "var(--t-h1)",
                marginTop: 12,
                lineHeight: 1.05,
                letterSpacing: "-0.025em",
                fontWeight: 500,
                maxWidth: "18ch",
              }}
            >
              Routes without showing plumbing.
            </h2>
          </div>
          <p className="muted" style={{ maxWidth: "44ch", fontSize: 15 }}>
            Four neutral stages, each transparent on fee and ETA. You see what
            the route does, not who runs it.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 0,
            border: "1px solid var(--line)",
            borderRadius: 16,
            overflow: "hidden",
            background: "var(--bg-elev)",
          }}
        >
          {rails.map((r, i) => (
            <div
              key={r.label}
              style={{
                padding: "26px 22px",
                borderRight:
                  i < rails.length - 1 ? "1px solid var(--line)" : "none",
                position: "relative",
                minHeight: 220,
                minWidth: 0,
              }}
            >
              <div className="row between center" style={{ marginBottom: 22 }}>
                <span
                  className="font-mono"
                  style={{ fontSize: 11, color: "var(--fg-mute)" }}
                >
                  0{i + 1}
                </span>
                <span className="chip chip-inline" style={{ fontSize: 10 }}>
                  {r.label}
                </span>
              </div>
              <div style={{ color: "var(--accent)", marginBottom: 14 }}>
                {r.glyph}
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
      sub: "Direct deposit to local banks.",
      examples: [
        ["NGN", "GTBank · 0124 4429"],
        ["EUR", "SEPA · DE89 3704 0044…"],
        ["USD", "ACH · *****4429"],
        ["GBP", "Faster Payments · 12-34-56"],
      ],
      glyph: (
        <svg viewBox="0 0 32 32" width="28" height="28" fill="none" aria-hidden>
          <path
            d="M4 14L16 6l12 8M6 14v12h20V14M10 26v-7M16 26v-7M22 26v-7M3 28h26"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
    },
    {
      title: "Mobile money",
      sub: "Phone-number payouts.",
      examples: [
        ["NGN", "Opay · 080-1234-4429"],
        ["KES", "M-Pesa · 254 700 ***"],
        ["GHS", "MoMo · 024 *** 4429"],
        ["UGX", "MTN · 077 *** 4429"],
      ],
      glyph: (
        <svg viewBox="0 0 32 32" width="28" height="28" fill="none" aria-hidden>
          <rect
            x="10"
            y="3"
            width="12"
            height="26"
            rx="3"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path
            d="M14 6h4M16 25h.01"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      ),
    },
    {
      title: "Wallet address",
      sub: "External wallet, any chain.",
      examples: [
        ["ETH", "0x84a4…7d10"],
        ["SOL", "G7sX…dQ4n"],
        ["ARB", "0xA2…91Bc"],
        ["BTC", "bc1qx…f3kp"],
      ],
      glyph: (
        <svg viewBox="0 0 32 32" width="28" height="28" fill="none" aria-hidden>
          <rect
            x="4"
            y="8"
            width="24"
            height="18"
            rx="3"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path d="M4 12h24" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="23" cy="19" r="1.8" fill="currentColor" />
        </svg>
      ),
    },
    {
      title: "Stablecoin address",
      sub: "USDC or USDT, your network.",
      examples: [
        ["USDC", "Base"],
        ["USDC", "Solana"],
        ["USDT", "Tron"],
        ["USDC", "Arbitrum"],
      ],
      glyph: (
        <svg viewBox="0 0 32 32" width="28" height="28" fill="none" aria-hidden>
          <circle
            cx="16"
            cy="16"
            r="11"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path
            d="M16 9v14M12 12h6.5a2.5 2.5 0 0 1 0 5H13a2.5 2.5 0 0 0 0 5h7"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
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
        <div
          className="row between wrap"
          style={{ alignItems: "flex-end", gap: 24, marginBottom: 36 }}
        >
          <div>
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
              Built for local settlement.
            </h2>
          </div>
          <p className="muted" style={{ maxWidth: "44ch", fontSize: 15 }}>
            Stablecoins from any chain. Funds land in whatever the recipient
            actually uses — bank, mobile money, wallet, or chain.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
          }}
        >
          {methods.map((m) => (
            <article
              key={m.title}
              className="card"
              style={{
                padding: 20,
                display: "flex",
                flexDirection: "column",
                gap: 16,
                minWidth: 0,
              }}
            >
              <div style={{ color: "var(--accent)" }}>{m.glyph}</div>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 500 }}>{m.title}</h3>
                <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  {m.sub}
                </p>
              </div>
              <div className="hr" />
              <ul
                className="col gap-2"
                style={{ listStyle: "none", padding: 0, margin: 0 }}
              >
                {m.examples.map(([code, ex], j) => (
                  <li
                    key={j}
                    className="row center"
                    style={{ fontSize: 12.5, gap: 10, minWidth: 0 }}
                  >
                    <span
                      className="font-mono"
                      style={{
                        color: "var(--fg-mute)",
                        letterSpacing: 0.04,
                        flex: "0 0 auto",
                      }}
                    >
                      {code}
                    </span>
                    <span
                      className="font-mono"
                      style={{
                        color: "var(--fg-soft)",
                        flex: "1 1 0",
                        minWidth: 0,
                        textAlign: "right",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {ex}
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────── SUPPORTED CHAINS STRIP ──────────── */
function ChainsStrip() {
  const items: [string, string][] = [
    ["Ethereum", "ETH"],
    ["Base", "BASE"],
    ["Arbitrum", "ARB"],
    ["Optimism", "OP"],
    ["Polygon", "POLY"],
    ["Solana", "SOL"],
    ["BNB Chain", "BNB"],
    ["Tron", "TRON"],
    ["Bitcoin", "BTC"],
    ["Starknet", "STRK"],
  ];
  return (
    <section style={{ padding: "60px 0", borderTop: "1px solid var(--line)" }}>
      <div className="narrow" style={{ textAlign: "center" }}>
        <span className="eyebrow">Funds can come from</span>
        <div
          className="row center"
          style={{
            marginTop: 22,
            gap: 24,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          {items.map(([name, code]) => {
            const G = Chain[code];
            return (
              <span
                key={code}
                className="row center gap-2"
                title={name}
                style={{ color: "var(--fg-soft)", fontSize: 13 }}
              >
                <G size={22} />
                <span style={{ fontSize: 13 }}>{name}</span>
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────── REASSURANCE ─────────────────────── */
function Reassurance() {
  const items = [
    {
      t: "Fees, always upfront.",
      c: "Network, rail, and FX broken out. No 'estimated' weasel words once the quote is firm.",
    },
    {
      t: "Picks the cheapest rail.",
      c: "USDC ↔ USDC where it can, off-ramp where it must. You never choose a bridge by hand.",
    },
    {
      t: "Built for the corridor.",
      c: "Local banks and mobile money across NGN, KES, GHS, EUR, USD, GBP — the payout that actually arrives.",
    },
  ];
  return (
    <section className="container" style={{ padding: "96px 0 0" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 1,
          background: "var(--line)",
          border: "1px solid var(--line)",
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        {items.map((i, n) => (
          <div
            key={n}
            style={{ background: "var(--bg)", padding: "28px 26px" }}
          >
            <span
              className="font-mono"
              style={{ fontSize: 11, color: "var(--accent)" }}
            >
              0{n + 1}
            </span>
            <h3
              style={{
                fontSize: 22,
                marginTop: 12,
                letterSpacing: "-0.02em",
                fontWeight: 500,
              }}
            >
              {i.t}
            </h3>
            <p
              className="muted"
              style={{ fontSize: 14, marginTop: 8, lineHeight: 1.55 }}
            >
              {i.c}
            </p>
          </div>
        ))}
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
          style={{
            fontSize: "var(--t-display)",
            lineHeight: 1.04,
            letterSpacing: "-0.03em",
            fontWeight: 500,
            maxWidth: "16ch",
            margin: "0 auto",
          }}
        >
          Skip the bridges.
          <br />
          <span style={{ color: "var(--fg-mute)" }}>Just say it.</span>
        </h2>
        <div
          className="row center gap-3"
          style={{ justifyContent: "center", marginTop: 28 }}
        >
          <button className="btn btn-primary btn-big" onClick={onOpenApp}>
            Try the demo <Icon.ArrowRight />
          </button>
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="btn btn-ghost btn-big"
          >
            Request access
          </a>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────── FOOTER ──────────────────────────── */
function Footer() {
  return (
    <footer style={{ borderTop: "1px solid var(--line)" }}>
      <div
        className="container"
        style={{
          padding: "32px 0",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: 24,
          fontSize: 12,
          color: "var(--fg-mute)",
        }}
      >
        <div className="row center gap-3">
          <Icon.Logo size={16} />
          <span>© 2026 Swap Chain Labs</span>
        </div>
        <div className="row center gap-6">
          <a href="#" onClick={(e) => e.preventDefault()}>
            Docs
          </a>
          <a href="#" onClick={(e) => e.preventDefault()}>
            API
          </a>
          <a href="#" onClick={(e) => e.preventDefault()}>
            Status
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
        <span className="font-mono">
          infra · CCTP · Stargate · LiFi · Paycrest · MoonPay · Stripe
        </span>
      </div>
    </footer>
  );
}

/* ───────────────────── LANDING ROOT ────────────────────── */
export default function Landing() {
  const router = useRouter();
  const onOpenApp = () => router.push("/swap");
  return (
    <div
      style={{ position: "relative", minHeight: "100vh", overflow: "hidden" }}
    >
      <TopBar onOpenApp={onOpenApp} />
      <Hero onOpenApp={onOpenApp} />
      <SentenceExamples />
      <RailCards />
      <Settlement />
      <ChainsStrip />
      <Reassurance />
      <FinalCTA onOpenApp={onOpenApp} />
      <Footer />
    </div>
  );
}
