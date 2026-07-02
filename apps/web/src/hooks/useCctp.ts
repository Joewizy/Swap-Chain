"use client";

/**
 * useCctp — full Circle CCTP v2 burn → attest → mint flow.
 *
 * Drives the whole USDC↔USDC cross-chain transfer from the connected
 * wallet, advancing through a status state machine the UI can render:
 *
 *   idle → approving → burning → attesting → switching → receiving
 *        → complete                                    (or → error)
 *
 * The on-chain steps (approve, depositForBurn, receiveMessage) are signed
 * by the user's wallet via wagmi. The off-chain attestation poll goes
 * through our own /api/cctp/* routes — Circle's Iris API is not
 * CORS-open to browsers.
 *
 * Pairs with src/rails/cctp.ts (addresses, ABIs, fee math) and the
 * /api/cctp/attestation + /api/cctp/fees routes.
 */

import { useCallback, useState } from "react";
import { erc20Abi } from "viem";
import { useAccount, useConfig } from "wagmi";
import {
  readContract,
  switchChain,
  waitForTransactionReceipt,
  writeContract,
} from "wagmi/actions";
import {
  FINALITY_THRESHOLD,
  MESSAGE_TRANSMITTER_V2_ABI,
  TOKEN_MESSENGER_V2_ABI,
  ZERO_BYTES32,
  addressToBytes32,
  computeMaxFee,
  getCctpContext,
  isCctpSupported,
  type CctpSpeed,
} from "@/rails/cctp";
import { getChain, getTokenAddress, type ChainId } from "@/config/network";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CctpStatus =
  | "idle"
  | "approving"
  | "burning"
  | "attesting"
  | "switching"
  | "receiving"
  | "complete"
  | "error";

export interface CctpBridgeParams {
  srcChain: ChainId;
  dstChain: ChainId;
  /** Raw USDC amount in 6-decimal base units (e.g. 1 USDC = 1_000_000n). */
  amount: bigint;
  /** Mint recipient. Defaults to the connected wallet. */
  recipient?: `0x${string}`;
  /** "fast" (~<60s, small fee) or "standard" (~15min, free). Default "fast". */
  speed?: CctpSpeed;
}

export interface CctpResult {
  burnTxHash: `0x${string}`;
  receiveTxHash: `0x${string}`;
}

export interface UseCctpReturn {
  status: CctpStatus;
  error: string | null;
  burnTxHash: `0x${string}` | null;
  receiveTxHash: `0x${string}` | null;
  /** True while a transfer is mid-flight (not idle/complete/error). */
  isRunning: boolean;
  bridge: (params: CctpBridgeParams) => Promise<CctpResult>;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Polling config
// ---------------------------------------------------------------------------

const ATTESTATION_POLL_INTERVAL_MS = 5_000;
const ATTESTATION_POLL_ATTEMPTS = 120; // 120 × 5s = 10 min

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCctp(): UseCctpReturn {
  const config = useConfig();
  const { address, isConnected } = useAccount();

  const [status, setStatus] = useState<CctpStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [burnTxHash, setBurnTxHash] = useState<`0x${string}` | null>(null);
  const [receiveTxHash, setReceiveTxHash] = useState<`0x${string}` | null>(
    null
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setBurnTxHash(null);
    setReceiveTxHash(null);
  }, []);

  const bridge = useCallback(
    async (params: CctpBridgeParams): Promise<CctpResult> => {
      const { srcChain, dstChain, amount, speed = "fast" } = params;

      try {
        setError(null);
        setBurnTxHash(null);
        setReceiveTxHash(null);

        // --- validate ----------------------------------------------------
        if (!isConnected || !address) {
          throw new Error("Connect a wallet first.");
        }
        if (!isCctpSupported(srcChain)) {
          throw new Error(`CCTP does not support source chain "${srcChain}".`);
        }
        if (!isCctpSupported(dstChain)) {
          throw new Error(
            `CCTP does not support destination chain "${dstChain}".`
          );
        }
        if (srcChain === dstChain) {
          throw new Error("Source and destination chains must differ.");
        }
        if (amount <= 0n) {
          throw new Error("Amount must be greater than zero.");
        }

        const recipient = params.recipient ?? address;

        const srcEntry = getChain(srcChain);
        const dstEntry = getChain(dstChain);
        if (!srcEntry?.viemChain || !dstEntry?.viemChain) {
          throw new Error(
            "CCTP requires EVM chains with a configured viem chain."
          );
        }
        const srcChainId = srcEntry.viemChain.id;
        const dstChainId = dstEntry.viemChain.id;

        const usdc = getTokenAddress("USDC", srcChain) as
          | `0x${string}`
          | undefined;
        if (!usdc) {
          throw new Error(`No USDC address configured for "${srcChain}".`);
        }

        const srcCtx = getCctpContext(srcChain);
        const dstCtx = getCctpContext(dstChain);

        // --- 0. ensure the wallet is on the source chain -----------------
        await switchChain(config, { chainId: srcChainId });

        // --- 1. approve USDC to the TokenMessenger (only if needed) ------
        setStatus("approving");
        const allowance = await readContract(config, {
          address: usdc,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, srcCtx.tokenMessenger],
          chainId: srcChainId,
        });
        if (allowance < amount) {
          const approveHash = await writeContract(config, {
            address: usdc,
            abi: erc20Abi,
            functionName: "approve",
            args: [srcCtx.tokenMessenger, amount],
            chainId: srcChainId,
          });
          await waitForTransactionReceipt(config, {
            hash: approveHash,
            chainId: srcChainId,
          });
        }

        // --- 2. size maxFee + burn on the source chain -------------------
        setStatus("burning");
        const maxFee =
          speed === "fast"
            ? await resolveFastMaxFee(srcChain, dstChain, amount)
            : 0n;

        const burnHash = await writeContract(config, {
          address: srcCtx.tokenMessenger,
          abi: TOKEN_MESSENGER_V2_ABI,
          functionName: "depositForBurn",
          args: [
            amount,
            dstCtx.domain,
            addressToBytes32(recipient),
            usdc,
            ZERO_BYTES32,
            maxFee,
            FINALITY_THRESHOLD[speed],
          ],
          chainId: srcChainId,
        });
        setBurnTxHash(burnHash);
        await waitForTransactionReceipt(config, {
          hash: burnHash,
          chainId: srcChainId,
        });

        // --- 3. poll Iris (via our route) for the attestation ------------
        setStatus("attesting");
        const { message, attestation } = await pollAttestation(
          srcChain,
          burnHash
        );

        // --- 4. switch to the destination chain + mint -------------------
        setStatus("switching");
        await switchChain(config, { chainId: dstChainId });

        setStatus("receiving");
        const receiveHash = await writeContract(config, {
          address: dstCtx.messageTransmitter,
          abi: MESSAGE_TRANSMITTER_V2_ABI,
          functionName: "receiveMessage",
          args: [message, attestation],
          chainId: dstChainId,
        });
        setReceiveTxHash(receiveHash);
        await waitForTransactionReceipt(config, {
          hash: receiveHash,
          chainId: dstChainId,
        });

        setStatus("complete");
        return { burnTxHash: burnHash, receiveTxHash: receiveHash };
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "CCTP transfer failed.";
        setError(msg);
        setStatus("error");
        throw err instanceof Error ? err : new Error(msg);
      }
    },
    [address, isConnected, config]
  );

  return {
    status,
    error,
    burnTxHash,
    receiveTxHash,
    isRunning:
      status !== "idle" && status !== "complete" && status !== "error",
    bridge,
    reset,
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** Looks up the Fast-transfer fee bps for a route and ceils it to a maxFee. */
async function resolveFastMaxFee(
  srcChain: ChainId,
  dstChain: ChainId,
  amount: bigint
): Promise<bigint> {
  const res = await fetch(
    `/api/cctp/fees?srcChain=${srcChain}&dstChain=${dstChain}`
  );
  if (!res.ok) {
    throw new Error(`Could not fetch the CCTP burn fee (${res.status}).`);
  }
  const { fees } = (await res.json()) as {
    fees: { finalityThreshold: number; minimumFee: number }[];
  };
  const fast = fees.find(
    (f) => f.finalityThreshold === FINALITY_THRESHOLD.fast
  );
  return computeMaxFee(amount, fast?.minimumFee ?? 0);
}

interface AttestationReady {
  message: `0x${string}`;
  attestation: `0x${string}`;
}

/** Polls /api/cctp/attestation until Circle has signed the burn message. */
async function pollAttestation(
  srcChain: ChainId,
  txHash: `0x${string}`
): Promise<AttestationReady> {
  for (let attempt = 0; attempt < ATTESTATION_POLL_ATTEMPTS; attempt++) {
    const res = await fetch(
      `/api/cctp/attestation?srcChain=${srcChain}&txHash=${txHash}`
    );
    if (res.ok) {
      const data = (await res.json()) as {
        ready: boolean;
        message: `0x${string}` | null;
        attestation: `0x${string}` | null;
      };
      if (data.ready && data.message && data.attestation) {
        return { message: data.message, attestation: data.attestation };
      }
    }
    await sleep(ATTESTATION_POLL_INTERVAL_MS);
  }
  throw new Error(
    "Attestation not ready after 10 minutes. The burn succeeded — " +
      "retry the mint later using the burn tx hash."
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
