import { NextRequest, NextResponse } from "next/server";
import { fetchBurnFees, isCctpSupported } from "@/rails/cctp";
import { resolveChain } from "@/config/network";

/**
 * GET /api/cctp/fees?srcChain=base-sepolia&dstChain=arbitrum-sepolia
 *
 * Proxies Circle Iris's burn-fee endpoint. Browsers can't hit Iris
 * directly (CORS), so the useCctp hook sizes its Fast-transfer `maxFee`
 * through this route.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const srcInput = searchParams.get("srcChain");
  const dstInput = searchParams.get("dstChain");

  if (!srcInput || !dstInput) {
    return NextResponse.json(
      { error: "srcChain and dstChain query params are required" },
      { status: 400 }
    );
  }

  const srcChain = resolveChain(srcInput);
  if (!srcChain || !isCctpSupported(srcChain)) {
    return NextResponse.json(
      { error: `Chain "${srcInput}" is not supported by CCTP` },
      { status: 400 }
    );
  }

  const dstChain = resolveChain(dstInput);
  if (!dstChain || !isCctpSupported(dstChain)) {
    return NextResponse.json(
      { error: `Chain "${dstInput}" is not supported by CCTP` },
      { status: 400 }
    );
  }

  try {
    const fees = await fetchBurnFees(srcChain, dstChain);
    return NextResponse.json({ fees });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 502 }
    );
  }
}
