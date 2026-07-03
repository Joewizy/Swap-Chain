// Web3 polyfills — must load before any wallet/viem code (see index.ts).
// Installs the crypto/Buffer globals RN lacks; metro.config.js aliases them.
// Native modules → runs in a dev client, not Expo Go.
import "react-native-get-random-values";
import "@walletconnect/react-native-compat";
import { install } from "react-native-quick-crypto";
import { Buffer } from "@craftzdog/react-native-buffer";

install();
global.Buffer = global.Buffer ?? (Buffer as unknown as typeof global.Buffer);

export {};
