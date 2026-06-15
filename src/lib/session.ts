/**
 * SIWE (Sign-In With Ethereum) session.
 *
 * A session is a stateless, HMAC-signed cookie carrying the authenticated
 * wallet address and an expiry. The user signs an off-chain SIWE message once
 * (gasless — no transaction), the /api/auth/verify route mints this cookie,
 * and protected routes call getSession() to read the proven address. Nothing
 * here trusts a client-supplied address; the address comes from a verified
 * signature only.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const SESSION_COOKIE = "siwe_session";
export const NONCE_COOKIE = "siwe_nonce";

/** 7-day session; user re-signs after this (or on wallet switch / logout). */
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
/** Nonce is single-use and short-lived. */
export const NONCE_MAX_AGE_SECONDS = 10 * 60;

interface SessionPayload {
  /** Lower-cased authenticated wallet address. */
  a: string;
  /** Expiry, epoch seconds. */
  e: number;
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "SESSION_SECRET is not set (or too short). SIWE auth cannot sign sessions."
    );
  }
  return s;
}

function sign(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

/** Mints a signed session token for a verified address. */
export function createSessionToken(address: string): string {
  const payload: SessionPayload = {
    a: address.toLowerCase(),
    e: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

/** Verifies a token's signature + expiry. Returns the address or null. */
export function verifySessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);

  const expectedSig = sign(body);
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    ) as SessionPayload;
    if (typeof payload.a !== "string" || typeof payload.e !== "number") {
      return null;
    }
    if (payload.e < Math.floor(Date.now() / 1000)) return null;
    return payload.a;
  } catch {
    return null;
  }
}

export interface Session {
  /** Lower-cased, signature-proven wallet address. */
  address: string;
}

/** Reads + verifies the SIWE session from request cookies. */
export function getSession(req: NextRequest): Session | null {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const address = verifySessionToken(token);
  return address ? { address } : null;
}
