import { NextRequest, NextResponse } from "next/server";
import {
  indexRampOrderForEmail,
  listStoredRampOrdersByEmail,
  upsertStoredRampOrder,
} from "@/lib/chainrailsStore";

export const runtime = "nodejs";

const RAMP_API = "https://api.chainrails.io/api/v1/ramp/orders";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function asNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return null;
}
function asString(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

/**
 * GET /api/chainrails/orders?email=… — a person's ChainRails ramp orders,
 * newest first, from the webhook-fed store. This is how history follows a user
 * across devices (they enter the same email). PII-light: no wallet/deposit
 * addresses. Soft identity until email verification lands — flagged to harden.
 */
export async function GET(req: NextRequest) {
  const email = (req.nextUrl.searchParams.get("email") ?? "").trim();
  if (!EMAIL_RE.test(email)) return NextResponse.json({ orders: [] });

  const records = await listStoredRampOrdersByEmail(email);
  const orders = records.map((r) => ({
    id: r.id,
    direction: r.direction,
    phase: r.phase,
    status: r.status,
    fiatCurrency: r.fiatCurrency,
    fiatAmount: r.fiatAmount,
    cryptoCurrency: r.cryptoCurrency,
    cryptoAmount: r.cryptoAmount,
    createdAt: r.createdAt,
  }));
  return NextResponse.json({ orders });
}

/**
 * POST /api/chainrails/orders — link an order id to the caller's email so it
 * shows in their history. The server re-fetches the authoritative order from
 * ChainRails, so the client can't inject fake amounts/status; it only asserts
 * "this email owns this order id". Fire-and-forget from the create flows.
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.CHAINRAILS_API_KEY;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = body.id != null ? String(body.id) : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!/^\d+$/.test(id) || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "A numeric id and a valid email are required." },
      { status: 400 }
    );
  }
  if (!apiKey) {
    return NextResponse.json(
      { error: "CHAINRAILS_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  let order: Record<string, unknown> | null = null;
  try {
    const res = await fetch(`${RAMP_API}/${id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (res.ok) {
      const json = (await res.json().catch(() => null)) as unknown;
      if (json && typeof json === "object") {
        order = json as Record<string, unknown>;
      }
    }
  } catch {
    /* fall through to 404 */
  }
  const status = order ? asString(order.status) : null;
  if (!order || !status) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const dir = asString(order.direction);
  const direction =
    dir === "OFF_RAMP" ? "offramp" : dir === "ON_RAMP" ? "onramp" : null;
  const createdAtIso = asString(order.createdAt);

  await upsertStoredRampOrder({
    id,
    status,
    direction,
    intentAddress: asString(order.intentAddress),
    fiatCurrency: asString(order.fiatCurrency),
    fiatAmount: asNumber(order.fiatAmount),
    cryptoCurrency: asString(order.cryptoCurrency),
    cryptoAmount: asNumber(order.cryptoAmount),
    createdAt: createdAtIso,
    event: null,
  });
  await indexRampOrderForEmail(
    email,
    id,
    createdAtIso ? Date.parse(createdAtIso) : Date.now()
  );

  return NextResponse.json({ ok: true });
}
