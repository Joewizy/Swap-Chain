// SIWE auth client (token-based; RN has no cookie jar):
//   nonce → wallet signs → verify → store token → send as Bearer on protected calls.
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
