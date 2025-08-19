"use client";
import React from "react";
 
import { sepolia, mainnet } from "@starknet-react/chains";
import { StarknetConfig, publicProvider, ready, braavos, useInjectedConnectors, voyager,} from "@starknet-react/core";
 
export function StarknetProvider({ children }: { children: React.ReactNode }) {
  const injected = useInjectedConnectors({
    // Show these connectors if the user has no connector installed.
    recommended: [ready(), braavos()],
    // Prefer always showing at least recommended so the list is never empty
    includeRecommended: "always" as any,
    // Randomize the order of the connectors.
    order: "random",
  });
  const connectors = injected.connectors && injected.connectors.length > 0
    ? injected.connectors
    : [ready(), braavos()];
 
  return (
    <StarknetConfig
      chains={[mainnet, sepolia]}
      provider={publicProvider()}
      connectors={connectors}
      explorer={voyager}
    >
      {children}
    </StarknetConfig>
  );
}