import { useCallback, useState } from "react";
import { useAccount, useChainId, useDisconnect, useSignMessage } from "wagmi";
import { useAppKit } from "@reown/appkit-wagmi-react-native";
import { createSiweMessage } from "viem/siwe";
import { getNonce, verifySiwe } from "@/api/auth";
import { API_HOST, API_URL, ApiError } from "@/api/client";
import { useAuth } from "@/store/auth";

// Ties the connected wallet (wagmi) to the SIWE session. connect() opens the
// Reown modal; signIn() runs the round trip: nonce → sign → verify → store token.
export function useWalletAuth() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { open } = useAppKit();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const { status, address: sessionAddress, setSession, clear } = useAuth();

  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(() => {
    setError(null);
    void open();
  }, [open]);

  const signIn = useCallback(async () => {
    if (!address) {
      setError("Connect a wallet first.");
      return;
    }
    setSigningIn(true);
    setError(null);
    try {
      const { nonce } = await getNonce();
      const message = createSiweMessage({
        address,
        chainId,
        domain: API_HOST,
        uri: API_URL,
        nonce,
        version: "1",
        statement: "Sign in to Railglide to view your order history.",
      });
      const signature = await signMessageAsync({ message });
      const { token, address: verified } = await verifySiwe(message, signature);
      await setSession(token, verified);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Sign-in was cancelled or failed. Please try again."
      );
    } finally {
      setSigningIn(false);
    }
  }, [address, chainId, signMessageAsync, setSession]);

  const signOut = useCallback(async () => {
    await clear();
    disconnect();
  }, [clear, disconnect]);

  return {
    isConnected,
    address,
    sessionAddress,
    authStatus: status,
    signingIn,
    error,
    connect,
    signIn,
    signOut,
  };
}
