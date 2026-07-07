import Constants from "expo-constants";

/** The dev machine's host (e.g. "192.168.18.2") from Metro, without the port. */
function metroHost(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    // Fallback for older manifest shapes.
    (Constants as unknown as { manifest2?: { extra?: { expoGo?: { debuggerHost?: string } } } })
      .manifest2?.extra?.expoGo?.debuggerHost;
  return hostUri ? hostUri.split(":")[0] : null;
}

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (__DEV__ && metroHost() ? `http://${metroHost()}:3000` : "http://localhost:3000");

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
