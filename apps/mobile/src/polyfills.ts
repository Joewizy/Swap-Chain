/**
 * Web3 polyfills — imported first in index.ts, before any other code.
 *
 * React Native has no `window`, no global `crypto`, and no Node `Buffer` /
 * `stream`. `viem` and the WalletConnect stack assume they exist. Until the
 * wallet step of Phase 0 lands, none of that code runs, so this file is an
 * intentional no-op with the full setup staged below.
 *
 * When wiring the wallet (Phase 0 §6 of todo/MOBILE_ARCHITECTURE.md):
 *   1. Install: react-native-get-random-values, @walletconnect/react-native-compat,
 *      react-native-quick-crypto, @craftzdog/react-native-buffer, readable-stream.
 *   2. Uncomment the block below.
 *   3. Uncomment the resolver aliases in metro.config.js.
 *   4. Switch from Expo Go to a dev client (`expo-dev-client`) — these are
 *      native modules and won't run in Expo Go.
 *
 * import "react-native-get-random-values";
 * import "@walletconnect/react-native-compat";
 * import { install } from "react-native-quick-crypto";
 * install();
 * import { Buffer } from "@craftzdog/react-native-buffer";
 * global.Buffer = global.Buffer ?? Buffer;
 */

export {};
