/**
 * Client helper to open a SIWE session.
 *
 * Fetches a server nonce, has the connected wallet sign a SIWE message
 * (off-chain, gasless), and posts it to /api/auth/verify which sets the
 * session cookie. The user does this once; the cookie then authorizes order
 * history until it expires (or they switch wallets / log out).
 */
import { createSiweMessage } from "viem/siwe";

export async function signInWithEthereum(params: {
  address: `0x${string}`;
  chainId: number;
  signMessageAsync: (args: { message: string }) => Promise<string>;
}): Promise<string> {
  const nonceRes = await fetch("/api/auth/nonce");
  if (!nonceRes.ok) throw new Error("Couldn't start sign-in.");
  const { nonce } = (await nonceRes.json()) as { nonce: string };

  const message = createSiweMessage({
    address: params.address,
    chainId: params.chainId,
    domain: window.location.host,
    uri: window.location.origin,
    version: "1",
    nonce,
    statement: "Sign in to view your Swap-Chain order history.",
  });

  const signature = await params.signMessageAsync({ message });

  const verifyRes = await fetch("/api/auth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, signature }),
  });
  if (!verifyRes.ok) {
    const data = (await verifyRes.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(data?.error || "Sign-in failed.");
  }
  const { address } = (await verifyRes.json()) as { address: string };
  return address;
}
