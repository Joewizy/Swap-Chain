import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";

/**
 * GET /api/auth/session
 *
 * Returns the current authenticated address (or null) so the client can tell
 * whether it already holds a valid SIWE session before prompting to sign.
 */
export async function GET(req: NextRequest) {
  const session = getSession(req);
  return NextResponse.json({ address: session?.address ?? null });
}
