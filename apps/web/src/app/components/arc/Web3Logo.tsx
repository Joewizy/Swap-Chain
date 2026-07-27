import React from "react";
import type { ChainId } from "@/config/network";
import {
  NetworkArbitrumOne,
  NetworkAvalanche,
  NetworkBase,
  NetworkBinanceSmartChain,
  NetworkCelo,
  NetworkEthereum,
  NetworkHyperEvm,
  NetworkLisk,
  NetworkMonad,
  NetworkOptimism,
  NetworkPolygon,
  NetworkScroll,
  NetworkSolana,
  NetworkStarknet,
  NetworkTron,
  TokenUSDC,
  TokenUSDT,
} from "@web3icons/react";

type BrandedIcon = React.ElementType;

const TOKEN_ICONS: Record<string, BrandedIcon> = {
  USDC: TokenUSDC,
  USDT: TokenUSDT,
};

const CHAIN_ICONS: Partial<Record<ChainId, BrandedIcon>> = {
  ethereum: NetworkEthereum,
  sepolia: NetworkEthereum,
  base: NetworkBase,
  "base-sepolia": NetworkBase,
  arbitrum: NetworkArbitrumOne,
  "arbitrum-sepolia": NetworkArbitrumOne,
  polygon: NetworkPolygon,
  "polygon-amoy": NetworkPolygon,
  bnb: NetworkBinanceSmartChain,
  optimism: NetworkOptimism,
  "op-sepolia": NetworkOptimism,
  avalanche: NetworkAvalanche,
  "avalanche-fuji": NetworkAvalanche,
  solana: NetworkSolana,
  "solana-devnet": NetworkSolana,
  starknet: NetworkStarknet,
  "starknet-sepolia": NetworkStarknet,
  celo: NetworkCelo,
  lisk: NetworkLisk,
  scroll: NetworkScroll,
};

const RAMP_ICONS: Record<string, BrandedIcon> = {
  OPTIMISM_MAINNET: NetworkOptimism,
  AVALANCHE_MAINNET: NetworkAvalanche,
  SOLANA_MAINNET: NetworkSolana,
  MONAD_MAINNET: NetworkMonad,
  HYPEREVM_MAINNET: NetworkHyperEvm,
  TRON_MAINNET: NetworkTron,
};

function Logo({
  Icon,
  label,
  size,
}: {
  Icon?: BrandedIcon;
  label: string;
  size: number;
}) {
  if (Icon) return <Icon variant="branded" size={size} aria-hidden />;
  return (
    <span
      aria-hidden
      className="font-mono"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "0 0 auto",
        background: "var(--accent-soft)",
        color: "var(--accent)",
        fontSize: Math.max(8, size * 0.42),
        fontWeight: 600,
      }}
    >
      {label.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function TokenLogo({
  symbol,
  size = 18,
}: {
  symbol: string;
  size?: number;
}) {
  return (
    <Logo Icon={TOKEN_ICONS[symbol.toUpperCase()]} label={symbol} size={size} />
  );
}

export function ChainLogo({
  id,
  label,
  size = 20,
}: {
  id: ChainId;
  label?: string;
  size?: number;
}) {
  return <Logo Icon={CHAIN_ICONS[id]} label={label ?? id} size={size} />;
}

export function RampLogo({
  chainrailsChain,
  label,
  size = 20,
}: {
  chainrailsChain: string;
  label: string;
  size?: number;
}) {
  return <Logo Icon={RAMP_ICONS[chainrailsChain]} label={label} size={size} />;
}
