/**
 * Network universe — re-exported from the shared package (mobile side).
 *
 * Mirrors apps/web/src/config/network.ts. The canonical chain/token registry
 * lives in `@railglide/shared/network`; both clients bind to the same data so
 * they can't drift. The mode is read from `EXPO_PUBLIC_NETWORK` inside shared
 * (defaults to "testnet"). Do not add definitions here — edit the shared
 * package instead.
 */

export * from "@railglide/shared/network";
