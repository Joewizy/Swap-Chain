import { NextRequest, NextResponse } from "next/server";
import { fetchAttestation, isCctpSupported } from "@/rails/cctp";
import { resolveChain } from "@/config/network";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const srcChainInput = searchParams.get("srcChain");
  const txHash = searchParams.get("txHash");

  if (!srcChainInput || !txHash) {
    return NextResponse.json(
      { error: "srcChain and txHash query params are required" },
      { status: 400 }
    );
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return NextResponse.json(
      { error: "txHash must be a 0x-prefixed 32-byte hex string" },
      { status: 400 }
    );
  }

  const srcChain = resolveChain(srcChainInput);
  if (!srcChain || !isCctpSupported(srcChain)) {
    return NextResponse.json(
      { error: `Chain "${srcChainInput}" is not supported by CCTP` },
      { status: 400 }
    );
  }

  try {
    const data = await fetchAttestation(srcChain, txHash as `0x${string}`);
    const first = data.messages?.[0];
    return NextResponse.json({
      status: first?.status ?? "not_found",
      ready: first?.status === "complete",
      message: first?.message ?? null,
      attestation:
        first && first.attestation !== "PENDING" ? first.attestation : null,
      eventNonce: first?.eventNonce ?? null,
      raw: data,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 502 }
    );
  }
}
