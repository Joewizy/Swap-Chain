/**
 * Web3 polyfills — imported first in index.ts, before any other code.
 *
 * React Native has no `window`, no global `crypto`, and no Node `Buffer`. viem
 * and the WalletConnect/Reown stack assume they exist. These shims install the
 * globals; metro.config.js maps the bare `crypto`/`stream`/`buffer` specifiers
 * to their RN implementations.
 *
 * These are native modules (quick-crypto is Nitro-based), so the app now runs
 * only in a custom dev client — not Expo Go.
 */
import "react-native-get-random-values";
import "@walletconnect/react-native-compat";
import { install } from "react-native-quick-crypto";
import { Buffer } from "@craftzdog/react-native-buffer";

install();

// RN Buffer is API-compatible with the Node global.
global.Buffer = global.Buffer ?? (Buffer as unknown as typeof global.Buffer);

export {};
