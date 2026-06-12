import { NextRequest, NextResponse } from "next/server";
import {
  PAYCREST_BASE_URL,
  isPaycrestConfigured,
  isPaycrestFiat,
  normalizePaycrestOrder,
  type PaycrestOrder,
} from "@/rails/paycrest";

/**
 * POST /api/paycrest/order
 *
 * Creates a fiat off-ramp or on-ramp order via Paycrest's v2 Sender API.
 * The API key is server-only; hooks post a flat body and this route nests
 * it into Paycrest's { source, destination } shape.
 *
 * Off-ramp body: { direction?: "offramp", amount, token, network,
 *   refundAddress, currency, recipient, reference? }
 *
 * On-ramp body: { direction: "onramp", amount, amountIn?: "fiat"|"crypto",
 *   fiatCurrency, refundAccount, token, network, recipientAddress, reference? }
 *
 * Returns HTTP 501 until PAYCREST_API_KEY is set in the server env.
 *
 * Docs: https://docs.paycrest.io/implementation-guides/sender-api-integration
 */

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

function paycrestErrorResponse(raw: unknown, res: Response) {
  let message = `Couldn't create this order (${res.status}).`;
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    message = String(r.message ?? r.error ?? message);
    const detail = r.data as
      | { field?: unknown; message?: unknown }
      | undefined;
    if (detail && typeof detail.message === "string") {
      message += ` ${detail.field ? `[${String(detail.field)}] ` : ""}${detail.message}`;
    }
  }
  return NextResponse.json(
    { error: message },
    { status: res.status === 401 ? 401 : 502 }
  );
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const direction =
    body.direction === "onramp"
      ? "onramp"
      : body.direction === "offramp"
        ? "offramp"
        : body.refundAccount
          ? "onramp"
          : "offramp";

  const apiKey = process.env.PAYCREST_API_KEY;
  if (!isPaycrestConfigured() || !apiKey) {
    return NextResponse.json(
      {
        error:
          "Fiat payouts aren't available right now. Try again later.",
      },
      { status: 501 }
    );
  }

  let paycrestBody: Record<string, unknown>;
  let fallbackCurrency: string;

  if (direction === "onramp") {
    const built = buildOnrampBody(body);
    if ("error" in built) {
      return NextResponse.json({ error: built.error }, { status: 400 });
    }
    paycrestBody = built.body;
    fallbackCurrency = built.fiatCurrency;
  } else {
    const built = buildOfframpBody(body);
    if ("error" in built) {
      return NextResponse.json({ error: built.error }, { status: 400 });
    }
    paycrestBody = built.body;
    fallbackCurrency = built.currency;
  }

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
          error instanceof Error ? error.message : "Request failed",
      },
      { status: 502 }
    );
  }

  const raw: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    return paycrestErrorResponse(raw, res);
  }

  const payload =
    raw && typeof raw === "object" && "data" in raw
      ? ((raw as Record<string, unknown>).data as Record<string, unknown>)
      : (raw as Record<string, unknown> | null);

  if (!payload || typeof payload.id !== "string") {
    return NextResponse.json(
      { error: "Unexpected response from payout service", raw },
      { status: 502 }
    );
  }

  if (!payload.currency && fallbackCurrency) {
    payload.currency = fallbackCurrency;
  }

  const order: PaycrestOrder = normalizePaycrestOrder(payload, raw);
  return NextResponse.json(order);
}

function buildOfframpBody(
  body: Record<string, unknown>
):
  | { body: Record<string, unknown>; currency: string }
  | { error: string } {
  const { amount, token, network, refundAddress, currency, reference } = body;
  const recipient = body.recipient as
    | {
        institution?: unknown;
        accountIdentifier?: unknown;
        accountName?: unknown;
        memo?: unknown;
      }
    | undefined;

  if (typeof amount !== "string" || !(Number(amount) > 0)) {
    return { error: "amount must be a positive decimal string" };
  }
  if (token !== "USDC" && token !== "USDT") {
    return { error: 'token must be "USDC" or "USDT"' };
  }
  if (typeof network !== "string" || !network) {
    return {
      error: 'network is required (e.g. "base")',
    };
  }
  if (typeof refundAddress !== "string" || !EVM_ADDRESS.test(refundAddress)) {
    return { error: "refundAddress must be a 0x-prefixed EVM address" };
  }
  if (typeof currency !== "string" || !isPaycrestFiat(currency)) {
    return {
      error: `Unsupported payout currency "${String(currency)}"`,
    };
  }
  if (
    !recipient ||
    typeof recipient.institution !== "string" ||
    typeof recipient.accountIdentifier !== "string" ||
    typeof recipient.accountName !== "string"
  ) {
    return {
      error:
        "recipient.institution, accountIdentifier and accountName are required",
    };
  }

  return {
    currency: currency.toUpperCase(),
    body: {
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
    },
  };
}

function buildOnrampBody(
  body: Record<string, unknown>
):
  | { body: Record<string, unknown>; fiatCurrency: string }
  | { error: string } {
  const {
    amount,
    token,
    network,
    recipientAddress,
    reference,
    fiatCurrency,
    amountIn,
  } = body;
  const refundAccount = body.refundAccount as
    | {
        institution?: unknown;
        accountIdentifier?: unknown;
        accountName?: unknown;
      }
    | undefined;

  if (typeof amount !== "string" || !(Number(amount) > 0)) {
    return { error: "amount must be a positive decimal string" };
  }
  if (token !== "USDC" && token !== "USDT") {
    return { error: 'token must be "USDC" or "USDT"' };
  }
  if (typeof network !== "string" || !network) {
    return {
      error: 'network is required (e.g. "base")',
    };
  }
  if (
    typeof recipientAddress !== "string" ||
    !EVM_ADDRESS.test(recipientAddress)
  ) {
    return { error: "recipientAddress must be a 0x-prefixed EVM address" };
  }
  const fiat =
    typeof fiatCurrency === "string"
      ? fiatCurrency
      : typeof body.currency === "string"
        ? body.currency
        : null;
  if (!fiat || !isPaycrestFiat(fiat)) {
    return {
      error: `Unsupported fiat currency "${String(fiat ?? "(none)")}"`,
    };
  }
  if (
    !refundAccount ||
    typeof refundAccount.institution !== "string" ||
    typeof refundAccount.accountIdentifier !== "string" ||
    typeof refundAccount.accountName !== "string"
  ) {
    return {
      error:
        "refundAccount.institution, accountIdentifier and accountName are required",
    };
  }

  const resolvedAmountIn =
    amountIn === "crypto" || amountIn === "fiat" ? amountIn : "fiat";

  return {
    fiatCurrency: fiat.toUpperCase(),
    body: {
      amount,
      amountIn: resolvedAmountIn,
      source: {
        type: "fiat",
        currency: fiat.toUpperCase(),
        refundAccount: {
          institution: refundAccount.institution,
          accountIdentifier: refundAccount.accountIdentifier,
          accountName: refundAccount.accountName,
        },
      },
      destination: {
        type: "crypto",
        currency: token,
        recipient: {
          address: recipientAddress,
          network,
        },
      },
      ...(typeof reference === "string" && reference ? { reference } : {}),
    },
  };
}
