/**
 * Shared domain types — re-exported from the shared package.
 *
 * The canonical shapes (swap, quote, relay, config, api) now live in
 * `@railglide/shared/types` so web and mobile stay in lockstep. This file keeps
 * the `@/types` import path working; add new cross-client types in the shared
 * package, and keep single-consumer types co-located with their code.
 */

export * from "@railglide/shared/types";
