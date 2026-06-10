"use client";

// AppScreens.tsx — History, Recipients, Settings screens

import React, { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { formatFiat } from "@/utils";
import { Icon } from "./icons";

/* ────────────────── HISTORY ────────────────── */

/** One order from /api/paycrest/orders. */
type Order = {
  id: string;
  direction: "offramp" | "onramp";
  status: string;
  amount: string;
  token: string;
  network: string;
  rate: string | null;
  currency: string | null;
  fiatAmount: number | null;
  recipientName: string | null;
  institution: string | null;
  accountIdentifier: string | null;
  txHash: string | null;
  createdAt: string | null;
};

/** Maps a Paycrest status to a chip tone + label. */
function statusChip(status: string): { tone: "ok" | "pend" | "err"; label: string } {
  switch (status) {
    case "settled":
      return { tone: "ok", label: "Paid" };
    case "refunded":
      return { tone: "err", label: "Refunded" };
    case "expired":
      return { tone: "err", label: "Expired" };
    case "processing":
      return { tone: "pend", label: "Processing" };
    case "pending":
      return { tone: "pend", label: "Pending" };
    default:
      return { tone: "pend", label: "Awaiting funds" };
  }
}

function fiatLabel(currency: string | null, amount: number | null): string {
  if (amount === null || !currency) return "—";
  return formatFiat(currency, amount);
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso).getTime();
  const mins = Math.round((Date.now() - d) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString();
}

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
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/paycrest/orders?address=${address}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
      setOrders(data.orders ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load orders.");
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (isConnected && address) load();
    else setOrders([]);
  }, [isConnected, address, load]);

  return (
    <div className="col gap-6">
      <header className="row between center wrap" style={{ gap: 12 }}>
        <div>
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
            Your cash-out and on-ramp orders.
          </span>
        </div>
        {isConnected && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={load}
            disabled={loading}
          >
            {loading ? <Icon.Spinner size={12} /> : <Icon.Arrow size={12} />}{" "}
            Refresh
          </button>
        )}
      </header>

      {!isConnected ? (
        <EmptyState
          title="Connect your wallet"
          sub="Connect to see the orders tied to your address."
          action={
            <button
              className="btn btn-primary btn-sm"
              onClick={() => openConnectModal?.()}
            >
              Connect wallet
            </button>
          }
        />
      ) : error ? (
        <EmptyState title="Couldn't load orders" sub={error} />
      ) : loading && orders.length === 0 ? (
        <EmptyState title="Loading…" sub="Fetching your orders." />
      ) : orders.length === 0 ? (
        <EmptyState
          title="No orders yet"
          sub="Your cash-outs will show up here once you create one."
        />
      ) : (
        <div className="col gap-3">
          {orders.map((o) => (
            <OrderCard key={o.id} order={o} />
          ))}
        </div>
      )}
    </div>
  );
}

function OrderCard({ order }: { order: Order }) {
  const chip = statusChip(order.status);
  const isOfframp = order.direction === "offramp";
  return (
    <article className="card" style={{ padding: 16 }}>
      <div className="row between center" style={{ gap: 12 }}>
        <div className="col" style={{ gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 500 }}>
            {isOfframp ? "Cash out" : "Buy crypto"} ·{" "}
            <span className="font-mono">
              {order.amount} {order.token}
            </span>
          </span>
          <span
            className="muted"
            style={{
              fontSize: 12.5,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {order.recipientName
              ? `${order.recipientName}${order.institution ? ` · ${order.institution}` : ""}`
              : order.network}
            {order.accountIdentifier ? ` · ${order.accountIdentifier}` : ""}
          </span>
        </div>
        <span
          className={
            chip.tone === "ok"
              ? "chip chip-ok"
              : chip.tone === "pend"
                ? "chip chip-pend"
                : "chip chip-err"
          }
          style={{ padding: "2px 10px", flex: "0 0 auto" }}
        >
          {chip.label}
        </span>
      </div>

      <div className="hr" style={{ margin: "12px 0" }} />

      <div className="row between center" style={{ fontSize: 12.5 }}>
        <span className="font-mono" style={{ color: "var(--accent)" }}>
          {isOfframp
            ? fiatLabel(order.currency, order.fiatAmount)
            : `${order.amount} ${order.token}`}
          {order.rate ? (
            <span className="muted"> · {order.rate}/{order.token}</span>
          ) : null}
        </span>
        <span className="muted font-mono" style={{ fontSize: 11 }}>
          {timeAgo(order.createdAt)}
        </span>
      </div>
    </article>
  );
}

function EmptyState({
  title,
  sub,
  action,
}: {
  title: string;
  sub: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className="card col center gap-2"
      style={{ padding: 40, textAlign: "center" }}
    >
      <span style={{ fontSize: 15, fontWeight: 500 }}>{title}</span>
      <span className="muted" style={{ fontSize: 13, maxWidth: "40ch" }}>
        {sub}
      </span>
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
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
