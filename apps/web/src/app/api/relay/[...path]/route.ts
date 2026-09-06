import { NextRequest, NextResponse } from "next/server";
import { IS_MAINNET } from "@/config/network";

/**
 * Relay API proxy.
 *
 * Relay now requires an API key on its API calls, but that key must never
 * ship to the browser. The Relay widget and our own executor talk to Relay
 * from the browser, so we point them at this same-origin proxy instead of
 * api.relay.link. Every request is forwarded to the real Relay API with the
 * secret `x-api-key` header attached here, server-side.
 *
 *   browser → /api/relay/<path>?<query>  →  https://api.relay.link/<path>?<query>
 */

// The real Relay API — only ever called from the server so the key stays secret.
const RELAY_UPSTREAM = IS_MAINNET
  ? "https://api.relay.link"
  : "https://api.testnets.relay.link";

const RELAY_API_KEY = process.env.RELAY_API_KEY;

async function proxy(request: NextRequest, path: string[]) {
  const target = `${RELAY_UPSTREAM}/${path.join("/")}${request.nextUrl.search}`;

  const headers: Record<string, string> = {};
  const contentType = request.headers.get("content-type");
  if (contentType) headers["content-type"] = contentType;
  if (RELAY_API_KEY) headers["x-api-key"] = RELAY_API_KEY;

  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? await request.text() : undefined,
  });

  const responseBody = await upstream.text();

  if (!upstream.ok) {
    // Surface the upstream status + raw body before it becomes a generic error.
    console.error(
      `[relay proxy] ${request.method} /${path.join("/")} -> ${upstream.status}: ${responseBody}`
    );
  }

  return new NextResponse(responseBody, {
    status: upstream.status,
    headers: {
      "content-type":
        upstream.headers.get("content-type") ?? "application/json",
    },
  });
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  const { path } = await params;
  return proxy(request, path);
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const { path } = await params;
  return proxy(request, path);
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  const { path } = await params;
  return proxy(request, path);
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  const { path } = await params;
  return proxy(request, path);
}
