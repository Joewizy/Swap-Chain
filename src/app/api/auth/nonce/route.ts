import { NextResponse } from "next/server";
import { generateSiweNonce } from "viem/siwe";
import { NONCE_COOKIE, NONCE_MAX_AGE_SECONDS } from "@/lib/session";

/**
 * GET /api/auth/nonce
 *
 * Issues a single-use SIWE nonce and stores it in an httpOnly cookie. The
 * client embeds the nonce in the message it asks the wallet to sign; /verify
 * checks the signed message's nonce against this cookie to stop replay.
 */
export async function GET() {
  const nonce = generateSiweNonce();
  const res = NextResponse.json({ nonce });
  res.cookies.set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: NONCE_MAX_AGE_SECONDS,
  });
  return res;
}
