/**
 * @railglide/shared — the contract surface both clients import.
 *
 * Barrel for the common case (`import { getChain, type ChatReply } from
 * "@railglide/shared"`). Deep entry points stay available for callers that
 * want a narrower surface:
 *   - "@railglide/shared/network"          chain/token registry + resolvers
 *   - "@railglide/shared/types"            domain types (swap/quote/relay/…)
 *   - "@railglide/shared/assistant/types"  chat + flow types
 */

export * from "./network";
export * from "./types";
export * from "./assistant/types";
