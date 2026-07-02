// Metro config for the Railglide mobile app inside the npm-workspaces monorepo.
//
// Two jobs:
//  1. Monorepo resolution — watch the whole workspace and resolve hoisted deps
//     (including the symlinked `@railglide/shared`) from the root node_modules.
//  2. (later) Web3 polyfill resolver — when the wallet stack lands, viem and the
//     WalletConnect libs expect Node built-ins. Map them to RN shims here. Left
//     staged and commented until Phase 0's wallet step; see src/polyfills.ts.

const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 1. Monorepo: watch the whole workspace so Metro sees the symlinked
//    `@railglide/shared` source at packages/shared. Hierarchical lookup (the
//    Expo default) already walks up to the hoisted root node_modules, so no
//    resolver overrides are needed — keeping them tripped `expo-doctor`.
config.watchFolders = [workspaceRoot];

// 2. Web3 polyfill aliases — uncomment alongside installing the wallet stack
//    (react-native-quick-crypto, readable-stream, @craftzdog/react-native-buffer):
//
// config.resolver.extraNodeModules = {
//   ...config.resolver.extraNodeModules,
//   crypto: require.resolve("react-native-quick-crypto"),
//   stream: require.resolve("readable-stream"),
//   buffer: require.resolve("@craftzdog/react-native-buffer"),
// };

module.exports = config;
