/**
 * SIWE auth client. The flow mirrors the web app but is token-based instead of
 * cookie-based (RN has no browser cookie jar):
 *
 *   1. GET  /api/auth/nonce            → { nonce }   (also sets a nonce cookie,
 *      which RN's native cookie store round-trips to /verify)
 *   2. wallet signs a SIWE message embedding that nonce
 *   3. POST /api/auth/verify           → { address, token }
 *   4. token is stored in expo-secure-store and sent as `Authorization: Bearer`
 *      on protected calls (the backend's getSession accepts either transport)
 */
import { apiFetch } from "./client";

export interface NonceResponse {
  nonce: string;
}

export interface VerifyResponse {
  address: string;
  token: string;
}

export interface SessionResponse {
  address: string | null;
}

export function getNonce(): Promise<NonceResponse> {
  return apiFetch<NonceResponse>("/api/auth/nonce");
}

export function verifySiwe(
  message: string,
  signature: string
): Promise<VerifyResponse> {
  return apiFetch<VerifyResponse>("/api/auth/verify", {
    method: "POST",
    body: JSON.stringify({ message, signature }),
  });
}

/** Validate a stored token against the backend; returns the address or null. */
export function getSessionAddress(token: string): Promise<SessionResponse> {
  return apiFetch<SessionResponse>("/api/auth/session", {
    headers: { Authorization: `Bearer ${token}` },
  });
}
