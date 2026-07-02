/**
 * Chat routing types — re-exported from the shared package.
 *
 * The canonical chat/flow contract (ChatReply, FlowLaunch, FlowSeed, FlowId, …)
 * now lives in `@railglide/shared/assistant/types` so the assistant endpoint and
 * both clients agree on one shape. This file keeps the `@/assistant/types`
 * import path working. `FlowId` is now defined in shared — `Home.tsx`
 * re-exports it from here for existing `./Home` importers.
 */

export * from "@railglide/shared/assistant/types";
