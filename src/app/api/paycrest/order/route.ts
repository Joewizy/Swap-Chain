import { NextRequest, NextResponse } from "next/server";
import {
  PAYCREST_BASE_URL,
  isPaycrestConfigured,
  isPaycrestFiat,
  type PaycrestOrder,
  type PaycrestOrderStatus,
} from "@/rails/paycrest";

/**
 * POST /api/paycrest/order
 *
 * Creates a fiat off-ramp order via Paycrest's v2 Sender API. The API
 * key is server-only, so the call is proxied here: the usePaycrest hook
 * posts the flat PaycrestOrderRequest and this route nests it into
 * Paycrest's { source, destination } shape.
 *
 * Body: { amount, token, network, refundAddress, currency,
 *         recipient: { institution, accountIdentifier, accountName, memo? },
 *         reference? }
 *
 * Returns HTTP 501 until PAYCREST_API_KEY is set in the server env.
 *
 * Docs: https://docs.paycrest.io/implementation-guides/sender-api-integration
 */

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { amount, token, network, refundAddress, currency, reference } =
    body as Record<string, unknown>;
  const recipient = body.recipient as
    | {
        institution?: unknown;
        accountIdentifier?: unknown;
        accountName?: unknown;
        memo?: unknown;
      }
    | undefined;

  // --- validate ----------------------------------------------------------
  if (typeof amount !== "string" || !(Number(amount) > 0)) {
    return NextResponse.json(
      { error: "amount must be a positive decimal string" },
      { status: 400 }
    );
  }
  if (token !== "USDC" && token !== "USDT") {
    return NextResponse.json(
      { error: 'token must be "USDC" or "USDT"' },
      { status: 400 }
    );
  }
  if (typeof network !== "string" || !network) {
    return NextResponse.json(
      { error: "network is required (Paycrest network slug, e.g. \"base\")" },
      { status: 400 }
    );
  }
  if (typeof refundAddress !== "string" || !EVM_ADDRESS.test(refundAddress)) {
    return NextResponse.json(
      { error: "refundAddress must be a 0x-prefixed EVM address" },
      { status: 400 }
    );
  }
  if (typeof currency !== "string" || !isPaycrestFiat(currency)) {
    return NextResponse.json(
      { error: `Unsupported payout currency "${String(currency)}"` },
      { status: 400 }
    );
  }
  if (
    !recipient ||
    typeof recipient.institution !== "string" ||
    typeof recipient.accountIdentifier !== "string" ||
    typeof recipient.accountName !== "string"
  ) {
    return NextResponse.json(
      {
        error:
          "recipient.institution, accountIdentifier and accountName are required",
      },
      { status: 400 }
    );
  }

  // --- config gate -------------------------------------------------------
  const apiKey = process.env.PAYCREST_API_KEY;
  if (!isPaycrestConfigured() || !apiKey) {
    return NextResponse.json(
      {
        error:
          "Paycrest is not configured. Set PAYCREST_API_KEY in the server env.",
      },
      { status: 501 }
    );
  }

  // --- build Paycrest v2 Sender-API body ---------------------------------
  const paycrestBody = {
    amount,
    source: {
      type: "crypto",
      currency: token,
      network,
      refundAddress,
    },
    destination: {
      type: "fiat",
      currency: currency.toUpperCase(),
      recipient: {
        institution: recipient.institution,
        accountIdentifier: recipient.accountIdentifier,
        accountName: recipient.accountName,
        ...(typeof recipient.memo === "string" && recipient.memo
          ? { memo: recipient.memo }
          : {}),
      },
    },
    ...(typeof reference === "string" && reference ? { reference } : {}),
  };

  // --- call Paycrest -----------------------------------------------------
  let res: Response;
  try {
    res = await fetch(`${PAYCREST_BASE_URL}/v2/sender/orders`, {
      method: "POST",
      headers: {
        "API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(paycrestBody),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Paycrest request failed",
      },
      { status: 502 }
    );
  }

  const raw: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      raw && typeof raw === "object"
        ? String(
            (raw as Record<string, unknown>).message ??
              (raw as Record<string, unknown>).error ??
              `Paycrest order failed (${res.status}).`
          )
        : `Paycrest order failed (${res.status}).`;
    return NextResponse.json(
      { error: message },
      { status: res.status === 401 ? 401 : 502 }
    );
  }

  // Paycrest may wrap the payload as { status, message, data }.
  const payload =
    raw && typeof raw === "object" && "data" in raw
      ? ((raw as Record<string, unknown>).data as Record<string, unknown>)
      : (raw as Record<string, unknown> | null);

  if (!payload || typeof payload.id !== "string") {
    return NextResponse.json(
      { error: "Paycrest returned an unrecognised response", raw },
      { status: 502 }
    );
  }

  const providerAccount = payload.providerAccount as
    | { receiveAddress?: unknown; validUntil?: unknown }
    | undefined;

  const order: PaycrestOrder = {
    id: payload.id,
    status: (payload.status as PaycrestOrderStatus) ?? "initiated",
    amount,
    currency: currency.toUpperCase(),
    receiveAddress:
      typeof providerAccount?.receiveAddress === "string"
        ? providerAccount.receiveAddress
        : undefined,
    validUntil:
      typeof providerAccount?.validUntil === "string"
        ? providerAccount.validUntil
        : undefined,
    createdAt:
      typeof payload.createdAt === "string"
        ? payload.createdAt
        : new Date().toISOString(),
    raw,
  };

  return NextResponse.json(order);
}
