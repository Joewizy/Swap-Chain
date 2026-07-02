import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, type Chain } from "viem";
import { arbitrum, base, bsc, mainnet, polygon } from "viem/chains";
import { parseSiweMessage, verifySiweMessage } from "viem/siwe";
import {
  NONCE_COOKIE,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
} from "@/lib/session";

/**
 * POST /api/auth/verify  { message, signature }
 *
 * Verifies a SIWE signature against the nonce we issued and the request's own
 * host (domain binding stops a signature captured on another site being
 * replayed here). On success, mints the session cookie. Supports EOAs and
 * smart-contract wallets (EIP-1271) via a per-chain public client.
 */

const CHAINS: Record<number, { chain: Chain; rpc?: string }> = {
  [mainnet.id]: { chain: mainnet, rpc: process.env.NEXT_PUBLIC_RPC_ETHEREUM },
  [base.id]: { chain: base, rpc: process.env.NEXT_PUBLIC_RPC_BASE },
  [arbitrum.id]: { chain: arbitrum, rpc: process.env.NEXT_PUBLIC_RPC_ARBITRUM },
  [polygon.id]: { chain: polygon, rpc: process.env.NEXT_PUBLIC_RPC_POLYGON },
  [bsc.id]: { chain: bsc, rpc: process.env.NEXT_PUBLIC_RPC_BNB },
};

function clientForChain(chainId: number | undefined) {
  const entry = CHAINS[chainId ?? mainnet.id] ?? CHAINS[mainnet.id]!;
  return createPublicClient({
    chain: entry.chain,
    transport: http(entry.rpc),
  });
}

export async function POST(req: NextRequest) {
  let body: { message?: unknown; signature?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { message, signature } = body;
  if (typeof message !== "string" || typeof signature !== "string") {
    return NextResponse.json(
      { error: "message and signature are required" },
      { status: 400 }
    );
  }

  const nonce = req.cookies.get(NONCE_COOKIE)?.value;
  if (!nonce) {
    return NextResponse.json(
      { error: "Login nonce expired. Please try again." },
      { status: 401 }
    );
  }

  const fields = parseSiweMessage(message);
  if (!fields.address) {
    return NextResponse.json(
      { error: "Malformed sign-in message" },
      { status: 400 }
    );
  }

  let valid = false;
  try {
    valid = await verifySiweMessage(clientForChain(fields.chainId), {
      message,
      signature: signature as `0x${string}`,
      nonce,
      domain: req.nextUrl.host,
    });
  } catch {
    valid = false;
  }

  if (!valid) {
    return NextResponse.json(
      { error: "Signature verification failed" },
      { status: 401 }
    );
  }

  const address = fields.address.toLowerCase();
  const res = NextResponse.json({ address });
  res.cookies.set(SESSION_COOKIE, createSessionToken(address), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  // Burn the nonce so it can't be reused.
  res.cookies.set(NONCE_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
