import { NextRequest, NextResponse } from "next/server";
import {
  PAYCREST_BASE_URL,
  isPaycrestConfigured,
  normalizePaycrestOrder,
  summarizePaycrestOrderForHistory,
} from "@/rails/paycrest";
import { getSession } from "@/lib/session";
import { isAdminAddress } from "@/lib/admin";
import type {
  CurrencyVolume,
  DashboardOrderRow,
  DashboardResponse,
  DashboardSummary,
  TokenVolume,
} from "@/lib/dashboardTypes";

/**
 * GET /api/dashboard/orders
 *
 * Admin analytics over EVERY order under our Paycrest sender API key. Unlike
 * /api/paycrest/orders (which filters to the caller's own wallet), this returns
 * the whole book, so it is gated twice: a valid SIWE session AND membership of
 * the DASHBOARD_ADMIN_WALLETS allowlist. The Paycrest key stays server-only.
 *
 * Pages through Paycrest's v2 sender orders list, then aggregates volume,
 * fee revenue, counts and success rate for the dashboard.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const PAGE_SIZE = 100;
const MAX_PAGES = 50; // safety cap: up to 5,000 orders per load

/** Coarse lifecycle bucket for a Paycrest status. */
function bucketOf(status: string): "success" | "failed" | "expired" | "pending" {
  const s = status.toLowerCase();
  if (s === "settled" || s === "fulfilled") return "success";
  if (s === "refunded" || s === "refunding") return "failed";
  if (s === "expired") return "expired";
  return "pending";
}

function ordersFromPage(raw: unknown): Record<string, unknown>[] {
  const data =
    raw && typeof raw === "object"
      ? (raw as Record<string, unknown>).data
      : null;
  if (
    data &&
    typeof data === "object" &&
    Array.isArray((data as Record<string, unknown>).orders)
  ) {
    return (data as Record<string, unknown>).orders as Record<string, unknown>[];
  }
  return [];
}

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminAddress(session.address)) {
    return NextResponse.json(
      { error: "This wallet isn't authorized for the dashboard." },
      { status: 403 }
    );
  }

  const apiKey = process.env.PAYCREST_API_KEY;
  if (!isPaycrestConfigured() || !apiKey) {
    return NextResponse.json(
      { error: "Paycrest isn't configured." },
      { status: 501 }
    );
  }

  // Walk every page of the sender order book (bounded by MAX_PAGES).
  const all: Record<string, unknown>[] = [];
  let truncated = false;
  let page = 1;
  for (; page <= MAX_PAGES; page++) {
    let res: Response;
    try {
      res = await fetch(
        `${PAYCREST_BASE_URL}/v2/sender/orders?page=${page}&pageSize=${PAGE_SIZE}`,
        { headers: { "API-Key": apiKey, Accept: "application/json" } }
      );
    } catch (error) {
      if (page === 1) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : "Request failed" },
          { status: 502 }
        );
      }
      break; // partial data beats nothing after page 1
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[dashboard] paycrest list failed", res.status, body);
      if (page === 1) {
        return NextResponse.json(
          { error: `Couldn't load orders (${res.status}).` },
          { status: 502 }
        );
      }
      break;
    }

    const list = ordersFromPage(await res.json().catch(() => null));
    all.push(...list);
    if (list.length < PAGE_SIZE) break; // last page reached
  }
  if (page > MAX_PAGES) truncated = true;

  // ---- Aggregate ---------------------------------------------------------
  const rows: DashboardOrderRow[] = [];
  const byStatus: Record<string, number> = {};
  const fiatMap = new Map<string, { volume: number; count: number }>();
  const tokenMap = new Map<string, { volume: number; fees: number }>();
  let successful = 0;
  let failed = 0;
  let expired = 0;
  let pending = 0;
  let buyCount = 0;
  let sellCount = 0;
  let hasFeeData = false;

  for (const payload of all) {
    const h = summarizePaycrestOrderForHistory(payload);
    const norm = normalizePaycrestOrder(payload);
    const senderFee =
      norm.senderFee != null && Number.isFinite(Number(norm.senderFee))
        ? Number(norm.senderFee)
        : null;
    if (senderFee && senderFee > 0) hasFeeData = true;

    byStatus[h.status] = (byStatus[h.status] ?? 0) + 1;
    const bucket = bucketOf(h.status);
    if (bucket === "success") successful++;
    else if (bucket === "failed") failed++;
    else if (bucket === "expired") expired++;
    else pending++;

    if (h.direction === "onramp") buyCount++;
    else sellCount++;

    // Volume + revenue count settled orders only ("what actually flowed").
    if (bucket === "success") {
      if (h.currency && h.fiatAmount != null && Number.isFinite(h.fiatAmount)) {
        const e = fiatMap.get(h.currency) ?? { volume: 0, count: 0 };
        e.volume += h.fiatAmount;
        e.count += 1;
        fiatMap.set(h.currency, e);
      }
      const token = h.token || "USDC";
      const te = tokenMap.get(token) ?? { volume: 0, fees: 0 };
      const amt = Number(h.amount);
      if (Number.isFinite(amt)) te.volume += amt;
      if (senderFee) te.fees += senderFee;
      tokenMap.set(token, te);
    }

    rows.push({
      id: h.id,
      createdAt: h.createdAt,
      direction: h.direction,
      status: h.status,
      token: h.token,
      network: h.network,
      amount: h.amount,
      currency: h.currency,
      fiatAmount: h.fiatAmount,
      senderFee,
      recipientName: h.recipientName,
      institution: h.institution,
    });
  }

  rows.sort(
    (a, b) =>
      (a.createdAt ? Date.parse(a.createdAt) : 0) <
      (b.createdAt ? Date.parse(b.createdAt) : 0)
        ? 1
        : -1
  );

  const terminal = successful + failed + expired;
  const settledFiatByCurrency: CurrencyVolume[] = [...fiatMap.entries()]
    .map(([currency, v]) => ({ currency, volume: v.volume, count: v.count }))
    .sort((a, b) => b.volume - a.volume);
  const cryptoByToken: TokenVolume[] = [...tokenMap.entries()]
    .map(([token, v]) => ({ token, volume: v.volume, fees: v.fees }))
    .sort((a, b) => b.volume - a.volume);

  const summary: DashboardSummary = {
    totalOrders: all.length,
    byStatus,
    successful,
    failed,
    expired,
    pending,
    successRate: terminal > 0 ? successful / terminal : null,
    buyCount,
    sellCount,
    settledFiatByCurrency,
    cryptoByToken,
    hasFeeData,
    truncated,
  };

  const body: DashboardResponse = {
    summary,
    orders: rows,
    address: session.address,
  };
  return NextResponse.json(body);
}
