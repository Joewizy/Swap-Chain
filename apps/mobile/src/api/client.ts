// Base API client → the Railglide backend. Mobile has no same-origin, so calls
// need an absolute base URL: set EXPO_PUBLIC_API_URL (LAN dev or deployed).

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

// Backend host (e.g. "192.168.1.20:3000") — the SIWE message's `domain`.
// Parsed by hand since RN has no reliable global URL.
export const API_HOST = API_URL.replace(/^https?:\/\//, "").replace(/\/.*$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Typed JSON request against the backend. `path` is a route like "/api/chat". */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(
      body || `Request to ${path} failed (${res.status})`,
      res.status
    );
  }

  return (await res.json()) as T;
}

export { API_URL };
