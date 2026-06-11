"use client";

/**
 * RelaySwapPanel — Bridge/Swap flow powered by Relay's official SwapWidget.
 *
 * Bridge/Swap flow via Relay (same-chain swaps and cross-chain bridges).
 * Execution happens inside the widget; onSwapSuccess surfaces a toast.
 * CCTP/Chainrails are out of scope here — add a router fork later if needed.
 */

import { useMemo, useState } from "react";
import { SwapWidget, type Token } from "@relayprotocol/relay-kit-ui";
import { adaptViemWallet } from "@relayprotocol/relay-sdk";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useWalletClient } from "wagmi";
import toast from "react-hot-toast";
import { Icon } from "./icons";
import {
  DEFAULT_SETTLEMENT_CHAIN_ID,
  getChain,
  getToken,
  getTokenAddress,
  type ChainId,
  type TokenSymbol,
} from "@/config/network";

function relayToken(symbol: TokenSymbol, chainId: ChainId): Token | undefined {
  const chain = getChain(chainId);
  const entry = getToken(symbol);
  const address = getTokenAddress(symbol, chainId);
  if (!chain?.numericId || !entry || !address) return undefined;
  return {
    chainId: chain.numericId,
    address,
    name: entry.name,
    symbol: entry.symbol,
    decimals: entry.decimals,
    logoURI: "",
    verified: true,
  };
}

/**
 * Seed the widget with a sensible pair for the active network. `to` is only
 * set when a token distinct from `from` actually resolves on this chain —
 * otherwise we leave it undefined and let the widget prompt (e.g. WETH has no
 * testnet address, which would otherwise produce a USDC→USDC default).
 */
function defaultPair(): { from?: Token; to?: Token } {
  const chainId = DEFAULT_SETTLEMENT_CHAIN_ID;
  const from = relayToken("USDC", chainId);
  const to = relayToken("ETH", chainId) ?? relayToken("USDT", chainId);
  return { from, to: to?.address === from?.address ? undefined : to };
}

export function RelaySwapPanel() {
  const { openConnectModal } = useConnectModal();
  const { data: walletClient } = useWalletClient();

  const wallet = useMemo(
    () => (walletClient ? adaptViemWallet(walletClient) : undefined),
    [walletClient]
  );

  const pair = useMemo(() => defaultPair(), []);
  const [fromToken, setFromToken] = useState<Token | undefined>(pair.from);
  const [toToken, setToToken] = useState<Token | undefined>(pair.to);

  return (
    <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
      <div className="col gap-4" style={{ width: "100%", maxWidth: 420 }}>
        <header className="col gap-1">
          <h1 style={{ fontSize: 28, lineHeight: 1.1, letterSpacing: "-0.02em", fontWeight: 500 }}>
            Bridge &amp; Swap
          </h1>
          <span className="muted" style={{ fontSize: 14 }}>
            Swap on one chain or bridge across — routed for the best price.
          </span>
        </header>

        <SwapWidget
          wallet={wallet}
          fromToken={fromToken}
          setFromToken={setFromToken}
          toToken={toToken}
          setToToken={setToToken}
          defaultAmount="10"
          supportedWalletVMs={["evm"]}
          onConnectWallet={() => openConnectModal?.()}
          onSwapSuccess={() => {
            toast.success("Swap complete");
          }}
          onSwapError={(message) => {
            toast.error(message || "Swap failed");
          }}
        />

        <span
          className="row center gap-1"
          style={{ fontSize: 11, color: "var(--fg-faint)", justifyContent: "center" }}
        >
          <Icon.Globe size={11} /> Powered by Relay
        </span>
      </div>
    </div>
  );
}
