/**
 * Network universe — re-exported from the shared package.
 *
 * The canonical chain/token registry and resolvers now live in
 * `@railglide/shared/network` so the web and mobile clients bind to the exact
 * same definitions. This file keeps the familiar `@/config/network` import path
 * working for the rest of the web app; do not add definitions here — edit the
 * shared package instead.
 */

export * from "@railglide/shared/network";
