// Branded token / network logos, matching the website (@web3icons). Per-icon
// imports keep the bundle small; SVG strings render via react-native-svg.
import { View, Text, StyleSheet } from "react-native";
import { SvgXml } from "react-native-svg";
import type { ChainId } from "@railglide/shared/network";
import { theme } from "@/theme";

import USDC from "@web3icons/core/svgs/tokens/branded/USDC.svg.js";
import USDT from "@web3icons/core/svgs/tokens/branded/USDT.svg.js";
import DAI from "@web3icons/core/svgs/tokens/branded/DAI.svg.js";
import EURC from "@web3icons/core/svgs/tokens/branded/EURC.svg.js";
import ETH from "@web3icons/core/svgs/tokens/branded/ETH.svg.js";
import BNB from "@web3icons/core/svgs/tokens/branded/BNB.svg.js";
import STRK from "@web3icons/core/svgs/tokens/branded/STRK.svg.js";
import SOL from "@web3icons/core/svgs/tokens/branded/SOL.svg.js";
import MATIC from "@web3icons/core/svgs/tokens/branded/MATIC.svg.js";
import AVAX from "@web3icons/core/svgs/tokens/branded/AVAX.svg.js";

import netBase from "@web3icons/core/svgs/networks/branded/base.svg.js";
import netEthereum from "@web3icons/core/svgs/networks/branded/ethereum.svg.js";
import netArbitrum from "@web3icons/core/svgs/networks/branded/arbitrum-one.svg.js";
import netPolygon from "@web3icons/core/svgs/networks/branded/polygon.svg.js";
import netBnb from "@web3icons/core/svgs/networks/branded/binance-smart-chain.svg.js";
import netOptimism from "@web3icons/core/svgs/networks/branded/optimism.svg.js";
import netAvalanche from "@web3icons/core/svgs/networks/branded/avalanche.svg.js";
import netSolana from "@web3icons/core/svgs/networks/branded/solana.svg.js";
import netTron from "@web3icons/core/svgs/networks/branded/tron.svg.js";
import netMonad from "@web3icons/core/svgs/networks/branded/monad.svg.js";
import netHyperEvm from "@web3icons/core/svgs/networks/branded/hyper-evm.svg.js";

const TOKEN_SVG: Record<string, string> = {
  USDC, USDT, DAI, EURC, ETH, WETH: ETH, BNB, STRK, SOL, MATIC, AVAX,
};

// Chain family → branded network icon (testnets reuse their mainnet logo).
const CHAIN_SVG: Partial<Record<ChainId, string>> = {
  base: netBase,
  "base-sepolia": netBase,
  ethereum: netEthereum,
  sepolia: netEthereum,
  arbitrum: netArbitrum,
  "arbitrum-sepolia": netArbitrum,
  polygon: netPolygon,
  "polygon-amoy": netPolygon,
  bnb: netBnb,
  optimism: netOptimism,
  "op-sepolia": netOptimism,
  avalanche: netAvalanche,
  "avalanche-fuji": netAvalanche,
  solana: netSolana,
  "solana-devnet": netSolana,
};

// ChainRails ramp destination → branded logo, keyed by the ChainRails chain
// enum (these aren't all app ChainIds, so they can't live in CHAIN_SVG).
const RAMP_SVG: Record<string, string> = {
  OPTIMISM_MAINNET: netOptimism,
  AVALANCHE_MAINNET: netAvalanche,
  SOLANA_MAINNET: netSolana,
  MONAD_MAINNET: netMonad,
  HYPEREVM_MAINNET: netHyperEvm,
  TRON_MAINNET: netTron,
};

function Fallback({ label, size }: { label: string; size: number }) {
  return (
    <View
      style={[
        styles.fallback,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.fallbackText, { fontSize: size * 0.4 }]}>
        {label.slice(0, 1)}
      </Text>
    </View>
  );
}

export function TokenLogo({
  symbol,
  size = 24,
}: {
  symbol: string;
  size?: number;
}) {
  const xml = TOKEN_SVG[symbol.toUpperCase()];
  return xml ? (
    <SvgXml xml={xml} width={size} height={size} />
  ) : (
    <Fallback label={symbol} size={size} />
  );
}

export function ChainLogo({ id, size = 24 }: { id: ChainId; size?: number }) {
  const xml = CHAIN_SVG[id];
  return xml ? (
    <SvgXml xml={xml} width={size} height={size} />
  ) : (
    <Fallback label={id} size={size} />
  );
}

/** Logo for a ChainRails ramp destination (Optimism, Solana, Monad, Tron, …). */
export function RampLogo({
  chainrailsChain,
  label,
  size = 24,
}: {
  chainrailsChain: string;
  label: string;
  size?: number;
}) {
  const xml = RAMP_SVG[chainrailsChain];
  return xml ? (
    <SvgXml xml={xml} width={size} height={size} />
  ) : (
    <Fallback label={label} size={size} />
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: theme.colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  fallbackText: { color: theme.colors.accent, fontWeight: "700" },
});
