"use client";

/**
 * Admin analytics dashboard.
 *
 * Connect a wallet, sign in once (SIWE — gasless), and if the address is on the
 * DASHBOARD_ADMIN_WALLETS allowlist the server returns aggregated stats over
 * every Paycrest order. All gating is enforced server-side in
 * /api/dashboard/orders; the UI here only reflects the server's answer.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useChainId, useSignMessage } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { TokenUSDC, TokenUSDT } from "@web3icons/react";
import { signInWithEthereum } from "@/lib/siweClient";
import type { DashboardResponse, DashboardOrderRow } from "@/lib/dashboardTypes";

type Filter = "all" | "onramp" | "offramp";

export default function DashboardClient() {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { signMessageAsync } = useSignMessage();
  const chainId = useChainId();

  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [authing, setAuthing] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<Filter>("all");
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/orders");
      if (res.status === 401) {
        setNeedsAuth(true);
        setForbidden(false);
        setData(null);
        return;
      }
      if (res.status === 403) {
        setForbidden(true);
        setNeedsAuth(false);
        setData(null);
        return;
      }
      const body = (await res.json().catch(() => null)) as
        | (DashboardResponse & { error?: string })
        | null;
      if (!res.ok) throw new Error(body?.error || `Error ${res.status}`);
      setNeedsAuth(false);
      setForbidden(false);
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  const signIn = useCallback(async () => {
    if (!address) return;
    setAuthing(true);
    setError(null);
    try {
      await signInWithEthereum({ address, chainId, signMessageAsync });
      setNeedsAuth(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setAuthing(false);
    }
  }, [address, chainId, signMessageAsync, load]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setData(null);
    setNeedsAuth(true);
    setForbidden(false);
  }, []);

  useEffect(() => {
    if (isConnected && address) load();
    else {
      setData(null);
      setNeedsAuth(false);
      setForbidden(false);
    }
  }, [isConnected, address, load]);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.orders.filter((o) => {
      if (filter !== "all" && o.direction !== filter) return false;
      if (status !== "all" && o.status.toLowerCase() !== status) return false;
      if (!q) return true;
      return (
        o.id.toLowerCase().includes(q) ||
        (o.recipientName?.toLowerCase().includes(q) ?? false) ||
        (o.institution?.toLowerCase().includes(q) ?? false) ||
        o.token.toLowerCase().includes(q) ||
        (o.currency?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [data, filter, status, search]);

  const statuses = useMemo(
    () => (data ? Object.keys(data.summary.byStatus).sort() : []),
    [data]
  );

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "32px 20px" }}>
      <header className="row between center wrap" style={{ gap: 12, marginBottom: 24 }}>
        <div>
          <span className="eyebrow">Paycrest</span>
          <h1
            style={{
              fontSize: 30,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              marginTop: 6,
              fontWeight: 500,
            }}
          >
            Dashboard
          </h1>
        </div>
        {data && (
          <div className="row center gap-3">
            <span className="muted" style={{ fontSize: 13 }}>
              {data.address.slice(0, 6)}…{data.address.slice(-4)}
            </span>
            <button className="btn btn-sm" onClick={() => void load()} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            <button className="btn btn-sm" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        )}
      </header>

      {error && (
        <div
          className="card"
          style={{ padding: 16, marginBottom: 16, borderColor: "var(--err, #E07A6A)" }}
        >
          <span style={{ color: "var(--err, #E07A6A)", fontSize: 14 }}>{error}</span>
        </div>
      )}

      {/* ---- Gates ---- */}
      {!isConnected ? (
        <Gate
          title="Connect your wallet"
          body="The dashboard is restricted to admin wallets. Connect, then sign in to prove you own the address."
          action={
            <button className="btn btn-primary" onClick={openConnectModal}>
              Connect wallet
            </button>
          }
        />
      ) : forbidden ? (
        <Gate
          title="Not authorized"
          body={`This wallet (${address?.slice(0, 6)}…${address?.slice(-4)}) isn't on the admin allowlist. Switch to an admin wallet, or add this address to DASHBOARD_ADMIN_WALLETS.`}
          action={
            <button className="btn" onClick={() => void signOut()}>
              Sign in with another wallet
            </button>
          }
        />
      ) : needsAuth ? (
        <Gate
          title="Sign in"
          body="Sign a message to prove you control this wallet. It's off-chain and gasless — no transaction, no fee."
          action={
            <button className="btn btn-primary" onClick={() => void signIn()} disabled={authing}>
              {authing ? "Check your wallet…" : "Sign in"}
            </button>
          }
        />
      ) : loading && !data ? (
        <p className="muted">Loading orders…</p>
      ) : data ? (
        <>
          {data.summary.truncated && (
            <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
              Showing the most recent {data.summary.totalOrders} orders (page cap reached).
            </p>
          )}
          <Summary data={data} />
          <OrdersTable
            rows={rows}
            total={data.orders.length}
            filter={filter}
            setFilter={setFilter}
            status={status}
            setStatus={setStatus}
            statuses={statuses}
            search={search}
            setSearch={setSearch}
          />
        </>
      ) : null}
    </div>
  );
}

/* ─────────────────────────── Summary ─────────────────────────── */

function Summary({ data }: { data: DashboardResponse }) {
  const s = data.summary;
  const rate = s.successRate != null ? `${Math.round(s.successRate * 100)}%` : "—";

  const primaryFiat = s.settledFiatByCurrency[0] ?? null;
  const fiatOrders = s.settledFiatByCurrency.reduce((n, c) => n + c.count, 0);
  const totalFees = s.cryptoByToken.reduce((sum, t) => sum + t.fees, 0);
  const hasVolume = primaryFiat != null || s.cryptoByToken.length > 0;

  return (
    <div className="col gap-4" style={{ marginBottom: 28 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
        }}
      >
        <Stat label="Total orders" value={String(s.totalOrders)} />
        <Stat label="Settled" value={String(s.successful)} sub={`${rate} success`} />
        <Stat label="In flight" value={String(s.pending)} />
        <Stat label="Failed / expired" value={String(s.failed + s.expired)} />
        <Stat label="Buys" value={String(s.buyCount)} />
        <Stat label="Sells" value={String(s.sellCount)} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 12,
        }}
      >
        {/* Volume settled */}
        <div className="card" style={{ padding: 16 }}>
          <span className="eyebrow">Volume settled</span>
          {!hasVolume ? (
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              No settled orders yet.
            </p>
          ) : (
            <>
              <div className="row center wrap" style={{ gap: "6px 10px", marginTop: 6 }}>
                <span
                  className="font-mono tabular"
                  style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}
                >
                  {primaryFiat
                    ? fmtMoney(primaryFiat.volume, primaryFiat.currency)
                    : fmtMoney(
                        s.cryptoByToken.reduce((n, t) => n + t.volume, 0),
                        "USD"
                      )}
                </span>
                {fiatOrders > 0 && (
                  <span className="muted" style={{ fontSize: 12 }}>
                    · {fiatOrders} order{fiatOrders === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              {s.settledFiatByCurrency.length > 1 && (
                <div className="col gap-1" style={{ marginTop: 8 }}>
                  {s.settledFiatByCurrency.slice(1).map((c) => (
                    <div key={c.currency} className="row between center">
                      <span className="muted" style={{ fontSize: 12 }}>
                        {c.currency}
                      </span>
                      <span className="font-mono tabular" style={{ fontSize: 12 }}>
                        {fmtMoney(c.volume, c.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {s.cryptoByToken.length > 0 && (
                <div
                  className="row wrap"
                  style={{ gap: "6px 16px", marginTop: 10 }}
                >
                  {s.cryptoByToken.map((t) => (
                    <TokenRow
                      key={t.token}
                      token={t.token}
                      value={fmtMoney(t.volume, t.token)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Fees earned */}
        <div className="card" style={{ padding: 16 }}>
          <span className="eyebrow">Your fees earned</span>
          {!s.hasFeeData ? (
            <p className="muted" style={{ fontSize: 13, marginTop: 8, lineHeight: 1.4 }}>
              No sender-fee data on these orders yet.
            </p>
          ) : (
            <>
              <div
                className="font-mono tabular"
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  letterSpacing: "-0.02em",
                  marginTop: 6,
                  color: "var(--ok)",
                }}
              >
                {fmtMoney(totalFees, "USD")}
              </div>
              <div className="row wrap" style={{ gap: "6px 16px", marginTop: 10 }}>
                {s.cryptoByToken.map((t) => (
                  <TokenRow
                    key={t.token}
                    token={t.token}
                    value={fmtMoney(t.fees, "USD")}
                    valueColor="var(--ok)"
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TokenRow({
  token,
  value,
  valueColor,
}: {
  token: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <span className="row center gap-2">
      <TokenMark token={token} />
      <span style={{ fontSize: 12, fontWeight: 500 }}>{token}</span>
      <span
        className="font-mono tabular"
        style={{ fontSize: 12, fontWeight: 500, color: valueColor ?? "var(--fg)" }}
      >
        {value}
      </span>
    </span>
  );
}

function TokenMark({ token }: { token: string }) {
  const size = 16;
  const t = token.toUpperCase();
  if (t === "USDC") {
    return <TokenUSDC variant="branded" size={size} />;
  }
  if (t === "USDT") {
    return <TokenUSDT variant="branded" size={size} />;
  }
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--bg-soft)",
        border: "1px solid var(--line)",
        display: "inline-block",
      }}
    />
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <span className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </span>
      <div style={{ fontSize: 26, fontWeight: 600, marginTop: 6 }}>{value}</div>
      {sub && (
        <span className="muted" style={{ fontSize: 12 }}>
          {sub}
        </span>
      )}
    </div>
  );
}

/* ─────────────────────────── Table ─────────────────────────── */

function OrdersTable({
  rows,
  total,
  filter,
  setFilter,
  status,
  setStatus,
  statuses,
  search,
  setSearch,
}: {
  rows: DashboardOrderRow[];
  total: number;
  filter: Filter;
  setFilter: (f: Filter) => void;
  status: string;
  setStatus: (s: string) => void;
  statuses: string[];
  search: string;
  setSearch: (s: string) => void;
}) {
  return (
    <div className="col gap-3">
      <div className="row between center wrap" style={{ gap: 12 }}>
        <span className="eyebrow">
          Orders · {rows.length}/{total}
        </span>
        <div className="row center gap-2 wrap">
          <select
            className="dash-input"
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
          >
            <option value="all">All types</option>
            <option value="offramp">Sell</option>
            <option value="onramp">Buy</option>
          </select>
          <select
            className="dash-input"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s.toLowerCase()}>
                {s}
              </option>
            ))}
          </select>
          <input
            className="dash-input"
            placeholder="Search id, name, bank…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--fg-soft)" }}>
              <Th>Date</Th>
              <Th>Type</Th>
              <Th align="right">Amount</Th>
              <Th align="right">Fiat</Th>
              <Th align="right">Fee</Th>
              <Th>Status</Th>
              <Th>Recipient</Th>
              <Th>Bank</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: 20 }} className="muted">
                  No orders match.
                </td>
              </tr>
            ) : (
              rows.map((o) => (
                <tr key={o.id} style={{ borderTop: "1px solid var(--line)" }}>
                  <Td>{o.createdAt ? new Date(o.createdAt).toLocaleDateString() : "—"}</Td>
                  <Td>{o.direction === "onramp" ? "Buy" : "Sell"}</Td>
                  <Td mono align="right">
                    {fmtMoney(o.amount, o.token)}
                  </Td>
                  <Td mono align="right">
                    {o.fiatAmount != null && o.currency
                      ? fmtMoney(o.fiatAmount, o.currency)
                      : "—"}
                  </Td>
                  <Td mono align="right">
                    {o.senderFee != null ? fmtMoney(o.senderFee, o.token) : "—"}
                  </Td>
                  <Td>
                    <span className={`dash-chip ${statusChipClass(o.status)}`}>
                      {o.status}
                    </span>
                  </Td>
                  <Td>{o.recipientName ?? "—"}</Td>
                  <Td>{o.institution ?? "—"}</Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      style={{
        padding: "12px 14px",
        fontWeight: 500,
        whiteSpace: "nowrap",
        textAlign: align,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  mono,
  align = "left",
}: {
  children: React.ReactNode;
  mono?: boolean;
  align?: "left" | "right";
}) {
  return (
    <td
      className={mono ? "font-mono tabular" : undefined}
      style={{ padding: "11px 14px", whiteSpace: "nowrap", textAlign: align }}
    >
      {children}
    </td>
  );
}

/* ─────────────────────────── Bits ─────────────────────────── */

function Gate({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  return (
    <div className="card col gap-3" style={{ padding: 28, maxWidth: 460 }}>
      <span style={{ fontSize: 18, fontWeight: 600 }}>{title}</span>
      <span className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
        {body}
      </span>
      <div style={{ marginTop: 4 }}>{action}</div>
    </div>
  );
}

const MONEY_SYMBOLS: Record<string, string> = {
  NGN: "₦",
  KES: "KSh",
  GHS: "₵",
  UGX: "USh",
  USD: "$",
  USDC: "$",
  USDT: "$",
};

/** "₦32,077.88" / "$21.59 USDC" / "$0.10" — symbol first; token suffix only for volume rows. */
function fmtMoney(n: number | string, unit: string, opts?: { bare?: boolean }): string {
  const value = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(value)) return "—";
  const code = unit.toUpperCase();
  const symbol = MONEY_SYMBOLS[code] ?? "";
  const amount = value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (code === "USD" || opts?.bare) return `${symbol}${amount}`;
  if (code === "USDC" || code === "USDT") {
    return `${symbol}${amount} ${code}`;
  }
  if (symbol) return `${symbol}${amount}`;
  return `${amount} ${code}`;
}

function statusChipClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "settled" || s === "fulfilled") return "dash-chip-ok";
  if (s === "expired" || s === "refunded" || s === "refunding" || s === "failed") {
    return "dash-chip-err";
  }
  return "dash-chip-pend";
}
