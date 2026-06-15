/**
 * Per-IP rate limiting for every /api/* route.
 */
import { NextResponse, type NextRequest } from "next/server";
import { rateLimit, type RateTier } from "@/lib/ratelimit";

function tierFor(pathname: string): RateTier {
  if (pathname.startsWith("/api/chat") || pathname.startsWith("/api/intent")) {
    return "llm";
  }
  if (pathname.startsWith("/api/paycrest/verify-account")) {
    return "verify";
  }
  if (pathname.startsWith("/api/paycrest/order")) {
    return "order";
  }
  return "default";
}

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "anon";
}

export async function middleware(req: NextRequest) {
  const tier = tierFor(req.nextUrl.pathname);
  const { success, limit, remaining, reset } = await rateLimit(
    tier,
    `${clientIp(req)}:${tier}`
  );

  if (!success) {
    const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
    return NextResponse.json(
      { error: "Too many requests. Please slow down and try again." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": String(Math.max(0, remaining)),
        },
      }
    );
  }

  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
