"use client";

// AppScreens.tsx — History, Recipients, Settings screens

import React, { useState } from "react";
import { Icon } from "./icons";

/* ────────────────── HISTORY ────────────────── */
type Txn = {
  when: string;
  who: string;
  sent: string;
  got: string;
  rail: string;
  status: string;
  tone: "ok" | "pend" | "err";
  kind: "Crypto" | "Fiat";
};

const TXNS: Txn[] = [
  {
    when: "Today · 14:22",
    who: "Tunde Adebayo · GTBank",
    sent: "200.00 USDC",
    got: "₦318,420",
    rail: "Deposit → Settle → Payout",
    status: "Paid",
    tone: "ok",
    kind: "Fiat",
  },
  {
    when: "Today · 10:08",
    who: "0xA2…91Bc · Arbitrum",
    sent: "20.00 USDC",
    got: "20.00 USDC",
    rail: "Deposit → Bridge → Payout",
    status: "Paid",
    tone: "ok",
    kind: "Crypto",
  },
  {
    when: "Yesterday",
    who: "SEPA · DE89 3704 0044",
    sent: "100.00 USDC",
    got: "€92.04",
    rail: "Deposit → Settle → Payout",
    status: "Paid",
    tone: "ok",
    kind: "Fiat",
  },
  {
    when: "Yesterday",
    who: "Tunde Adebayo · MTN MoMo",
    sent: "50.00 USDC",
    got: "₦79,605",
    rail: "Deposit → Settle → Payout",
    status: "Paid",
    tone: "ok",
    kind: "Fiat",
  },
  {
    when: "Mon · 18:44",
    who: "ACH · *****4429",
    sent: "150.00 USDC",
    got: "$149.70",
    rail: "Deposit → Settle → Payout",
    status: "Pending",
    tone: "pend",
    kind: "Fiat",
  },
  {
    when: "Sun · 09:22",
    who: "Your wallet · Solana",
    sent: "1,000.00 USDC",
    got: "1,000.00 USDC",
    rail: "Deposit → Bridge → Payout",
    status: "Paid",
    tone: "ok",
    kind: "Crypto",
  },
  {
    when: "Sat · 21:10",
    who: "Amaka · Kuda 9920 1144",
    sent: "30.00 USDC",
    got: "₦47,763",
    rail: "Deposit → Settle → Payout",
    status: "Failed",
    tone: "err",
    kind: "Fiat",
  },
  {
    when: "Fri · 12:01",
    who: "Your wallet · Base",
    sent: "0.5 ETH",
    got: "0.4998 ETH",
    rail: "Deposit → Bridge → Payout",
    status: "Paid",
    tone: "ok",
    kind: "Crypto",
  },
];
const FILTERS = ["All", "Crypto", "Fiat", "Pending", "Failed"];

type Recipient = {
  name: string;
  initials: string;
  method: string;
  sub: string;
  last: string;
  currency: string;
};

const RECIPIENTS: Recipient[] = [
  {
    name: "Tunde Adebayo",
    initials: "TA",
    method: "GTBank",
    sub: "0124 4429",
    last: "Today",
    currency: "NGN",
  },
  {
    name: "Tunde Adebayo",
    initials: "TA",
    method: "Opay",
    sub: "080-1234-4429",
    last: "Yesterday",
    currency: "NGN",
  },
  {
    name: "Amaka Eze",
    initials: "AE",
    method: "Kuda",
    sub: "9920 1144",
    last: "Sat",
    currency: "NGN",
  },
  {
    name: "Lukas Müller",
    initials: "LM",
    method: "SEPA",
    sub: "DE89 3704 0044 0532 0130",
    last: "Yesterday",
    currency: "EUR",
  },
  {
    name: "Aisha Mohamed",
    initials: "AM",
    method: "M-Pesa",
    sub: "254 700 ** 5572",
    last: "Last week",
    currency: "KES",
  },
  {
    name: "Sarah Chen",
    initials: "SC",
    method: "ACH",
    sub: "*****4429",
    last: "Mon",
    currency: "USD",
  },
  {
    name: "James Whitfield",
    initials: "JW",
    method: "Faster Pay",
    sub: "12-34-56 · 87654321",
    last: "Apr 29",
    currency: "GBP",
  },
  {
    name: "Your wallet · ARB",
    initials: "0x",
    method: "Wallet",
    sub: "0xA2…91Bc · Arbitrum",
    last: "Today",
    currency: "USDC",
  },
  {
    name: "Your wallet · SOL",
    initials: "0x",
    method: "Wallet",
    sub: "G7sX…dQ4n · Solana",
    last: "Sun",
    currency: "USDC",
  },
];

export function HistoryScreen() {
  const [filter, setFilter] = useState("All");
  const rows = TXNS.filter((t) => {
    if (filter === "All") return true;
    if (filter === "Crypto" || filter === "Fiat") return t.kind === filter;
    return t.status === filter;
  });

  return (
    <div className="col gap-6">
      <header>
        <span className="eyebrow">Activity</span>
        <h1
          style={{
            fontSize: 30,
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            marginTop: 6,
            fontWeight: 500,
          }}
        >
          History
        </h1>
        <span className="muted" style={{ fontSize: 14 }}>
          Everything that moved through Swap Chain.
        </span>
      </header>

      <div className="row center between wrap" style={{ gap: 12 }}>
        <div className="row gap-2 wrap">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="chip"
              style={{
                cursor: "pointer",
                background: filter === f ? "var(--btn-bg)" : "var(--bg-elev)",
                color: filter === f ? "var(--btn-fg)" : "var(--fg-soft)",
                borderColor: filter === f ? "var(--btn-bg)" : "var(--line-2)",
                padding: "6px 12px",
                fontSize: 12,
              }}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="row center gap-2">
          <button className="btn btn-ghost btn-sm">
            <Icon.Search size={12} /> Search
          </button>
          <button className="btn btn-ghost btn-sm">Export CSV</button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {/* head */}
        <div
          className="row center"
          style={{
            padding: "12px 20px",
            borderBottom: "1px solid var(--line)",
            fontFamily: "Geist Mono, monospace",
            fontSize: 10.5,
            letterSpacing: 0.08,
            textTransform: "uppercase",
            color: "var(--fg-mute)",
            gap: 16,
          }}
        >
          <span style={{ flex: "0 0 14%" }}>When</span>
          <span style={{ flex: "1 1 28%" }}>Recipient</span>
          <span style={{ flex: "0 0 18%", textAlign: "right" }}>Sent</span>
          <span style={{ flex: "0 0 18%", textAlign: "right" }}>Received</span>
          <span style={{ flex: "1 1 16%" }}>Rail</span>
          <span style={{ flex: "0 0 100px", textAlign: "right" }}>Status</span>
        </div>

        {rows.map((r, i) => (
          <button
            key={i}
            className="row center"
            style={{
              width: "100%",
              textAlign: "left",
              border: 0,
              background: "transparent",
              padding: "16px 20px",
              borderBottom:
                i < rows.length - 1 ? "1px solid var(--line)" : "none",
              gap: 16,
              color: "inherit",
              cursor: "pointer",
            }}
            onMouseOver={(e) =>
              (e.currentTarget.style.background = "var(--bg-soft)")
            }
            onMouseOut={(e) =>
              (e.currentTarget.style.background = "transparent")
            }
          >
            <span
              className="font-mono"
              style={{
                flex: "0 0 14%",
                fontSize: 12,
                color: "var(--fg-mute)",
              }}
            >
              {r.when}
            </span>
            <span style={{ flex: "1 1 28%", fontSize: 14 }}>{r.who}</span>
            <span
              className="font-mono tabular"
              style={{ flex: "0 0 18%", fontSize: 13.5, textAlign: "right" }}
            >
              {r.sent}
            </span>
            <span
              className="font-mono tabular"
              style={{
                flex: "0 0 18%",
                fontSize: 13.5,
                textAlign: "right",
                color: r.tone === "err" ? "var(--fg-faint)" : "var(--fg)",
              }}
            >
              {r.got}
            </span>
            <span
              className="font-mono"
              style={{
                flex: "1 1 16%",
                fontSize: 11,
                color: "var(--fg-mute)",
              }}
            >
              {r.rail}
            </span>
            <span style={{ flex: "0 0 100px", textAlign: "right" }}>
              <span
                className={
                  r.tone === "ok"
                    ? "chip chip-ok"
                    : r.tone === "pend"
                      ? "chip chip-pend"
                      : "chip chip-err"
                }
                style={{ padding: "2px 10px" }}
              >
                {r.status}
              </span>
            </span>
          </button>
        ))}

        {rows.length === 0 && (
          <div
            className="col center gap-2"
            style={{ padding: 48, textAlign: "center" }}
          >
            <span className="muted" style={{ fontSize: 14 }}>
              No transactions match that filter.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ────────────────── RECIPIENTS ────────────────── */
export function RecipientsScreen() {
  return (
    <div className="col gap-6">
      <header className="row between center wrap" style={{ gap: 16 }}>
        <div>
          <span className="eyebrow">People &amp; places</span>
          <h1
            style={{
              fontSize: 30,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              marginTop: 6,
              fontWeight: 500,
            }}
          >
            Recipients
          </h1>
          <span className="muted" style={{ fontSize: 14 }}>
            Banks, wallets, and mobile money you&apos;ve sent to before.
          </span>
        </div>
        <button className="btn btn-primary btn-sm">
          <Icon.Plus /> Add recipient
        </button>
      </header>

      <div
        className="row center"
        style={{
          padding: "10px 14px",
          border: "1px solid var(--line-2)",
          borderRadius: 10,
          background: "var(--bg-elev)",
          gap: 10,
        }}
      >
        <Icon.Search />
        <input
          placeholder="Search by name, number, or address"
          style={{
            flex: 1,
            border: 0,
            outline: "none",
            background: "transparent",
            fontSize: 14,
            color: "var(--fg)",
          }}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 12,
        }}
      >
        {RECIPIENTS.map((r, i) => (
          <article key={i} className="card" style={{ padding: 16 }}>
            <div className="row center gap-3">
              <span
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  background:
                    r.method === "Wallet"
                      ? "var(--bg-sunk)"
                      : "var(--accent-soft)",
                  color:
                    r.method === "Wallet" ? "var(--fg-soft)" : "var(--accent)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "Geist Mono, monospace",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {r.initials}
              </span>
              <div className="col grow" style={{ minWidth: 0 }}>
                <div className="row between center">
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {r.name}
                  </span>
                  <span
                    className="font-mono"
                    style={{ fontSize: 10.5, color: "var(--fg-mute)" }}
                  >
                    {r.currency}
                  </span>
                </div>
                <span
                  className="font-mono"
                  style={{ fontSize: 11.5, color: "var(--fg-mute)" }}
                >
                  {r.method} · {r.sub}
                </span>
              </div>
            </div>
            <div className="hr" style={{ margin: "12px 0" }} />
            <div className="row between center">
              <span
                className="font-mono"
                style={{ fontSize: 11, color: "var(--fg-mute)" }}
              >
                Last sent {r.last}
              </span>
              <button className="btn btn-ghost btn-sm">Send</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

/* ────────────────── SETTINGS ────────────────── */
export function SettingsScreen() {
  return (
    <div className="col gap-6">
      <header>
        <span className="eyebrow">Account</span>
        <h1
          style={{
            fontSize: 30,
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            marginTop: 6,
            fontWeight: 500,
          }}
        >
          Settings
        </h1>
      </header>
      <div className="card" style={{ padding: 0 }}>
        <SettingRow
          label="Connected wallet"
          value="0x84a4…7d10 · Base"
          action="Disconnect"
        />
        <SettingRow label="Default chain" value="Base" action="Change" />
        <SettingRow label="Default currency" value="NGN · ₦" action="Change" />
        <SettingRow
          label="KYC tier"
          value="Verified · Tier 2"
          action="Manage"
          badge="ok"
        />
        <SettingRow
          label="Notifications"
          value="Email + SMS"
          action="Edit"
          last
        />
      </div>
    </div>
  );
}

function SettingRow({
  label,
  value,
  action,
  last,
  badge,
}: {
  label: string;
  value: string;
  action: string;
  last?: boolean;
  badge?: string;
}) {
  return (
    <div
      className="row between center"
      style={{
        padding: "16px 22px",
        borderBottom: last ? "none" : "1px solid var(--line)",
      }}
    >
      <div className="col" style={{ gap: 2 }}>
        <span style={{ fontSize: 13, color: "var(--fg-mute)" }}>{label}</span>
        <span
          className="row center gap-2"
          style={{ fontSize: 14, color: "var(--fg)" }}
        >
          {value}{" "}
          {badge === "ok" && (
            <span
              className="chip chip-ok"
              style={{ padding: "1px 8px", fontSize: 10 }}
            >
              verified
            </span>
          )}
        </span>
      </div>
      <button className="btn btn-ghost btn-sm">{action}</button>
    </div>
  );
}
