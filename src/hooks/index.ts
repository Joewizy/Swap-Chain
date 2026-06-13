/**
 * Rail hooks — single import surface for the React layer.
 *
 *   import { useCctp, useChainrails, usePaycrest } from "@/hooks";
 *
 * Each hook wraps one rail (see src/rails/* for the pure modules and
 * src/app/api/* for the server routes). CCTP is fully wired; Chainrails
 * returns live quotes; Paycrest is a Phase 1 scaffold.
 */

export { useCctp } from "./useCctp";
export type {
  CctpStatus,
  CctpBridgeParams,
  CctpResult,
  UseCctpReturn,
} from "./useCctp";

export { useChainrails } from "./useChainrails";
export type {
  ChainrailsQuoteParams,
  ChainrailsQuote,
  ChainrailsStatus,
  UseChainrailsReturn,
} from "./useChainrails";

export { usePaycrest } from "./usePaycrest";
export type { PaycrestStatus, UsePaycrestReturn } from "./usePaycrest";

export { usePaycrestOfframp } from "./usePaycrestOfframp";
export type {
  PaycrestOfframpStatus,
  PaycrestOfframpParams,
  UsePaycrestOfframpReturn,
} from "./usePaycrestOfframp";

export { usePaycrestOnramp } from "./usePaycrestOnramp";
export type {
  PaycrestOnrampStatus,
  PaycrestOnrampParams,
  UsePaycrestOnrampReturn,
} from "./usePaycrestOnramp";

export { useRelaySwap } from "./useRelaySwap";
export type {
  RelaySwapStatus,
  RelaySwapParams,
  UseRelaySwapReturn,
} from "./useRelaySwap";

export { useTokenBalance } from "./useTokenBalance";
export type { UseTokenBalanceReturn } from "./useTokenBalance";

export { usePaycrestRate } from "./usePaycrestRate";
export type { UsePaycrestRateReturn } from "./usePaycrestRate";
