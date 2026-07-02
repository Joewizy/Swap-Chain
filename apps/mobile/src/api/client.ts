/**
 * Base API client → the Railglide backend (unchanged Next.js API routes).
 *
 * On web the app hits relative `/api/*` paths; on mobile there is no same
 * origin, so every call needs an absolute base URL. Point `EXPO_PUBLIC_API_URL`
 * at the running backend (e.g. your LAN dev URL `http://192.168.x.x:3000`, or
 * the deployed origin). See ARCHITECTURE.md — the mobile app is a client, not a
 * fork; it must not add mobile-specific endpoints.
 */

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

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
