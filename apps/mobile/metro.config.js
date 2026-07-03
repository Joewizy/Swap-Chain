// Metro config for the monorepo: workspace resolution, Web3 Node-builtin
// aliases, and dedup of the AppKit/WalletConnect singletons (see notes below).
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 1. Monorepo: watch the workspace and search both node_modules roots. The
//    AppKit packages install split across mobile/ and root and import siblings
//    from their src/ entry, so both paths are needed (expo-doctor flags this).
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// 2. Web3 polyfill aliases — viem and the WalletConnect/Reown stack import
//    Node built-ins that RN lacks. Map them to their RN shims so Metro resolves
//    them; the runtime globals are installed in src/polyfills.ts.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  crypto: require.resolve("react-native-quick-crypto"),
  stream: require.resolve("readable-stream"),
  buffer: require.resolve("@craftzdog/react-native-buffer"),
};

// 3. Force every @reown package onto one valtio 1.13.2 instance. AppKit's
//    controllers are valtio-proxy singletons; a 1.x/2.x split (scaffold-rn falls
//    through to the web app's root valtio 2.x) crashes <AppKit/> with "Cannot
//    convert undefined value to object".
const reownValtioBase = path.resolve(
  workspaceRoot,
  "node_modules/@reown/appkit-core-react-native"
);
// 4. WalletConnect relay singletons — anchor at root so every importer shares
//    one copy, else the sign response lands on a different `core` than the one
//    awaiting it ("session_request without any listeners" → sign hangs).
const WC_SINGLETONS = [
  "@walletconnect/core",
  "@walletconnect/sign-client",
  "@walletconnect/universal-provider",
];
const rootAnchor = path.join(workspaceRoot, "index.js");
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // valtio → one shared 1.13.2 instance for all @reown packages (see above).
  if (
    (moduleName === "valtio" || moduleName.startsWith("valtio/")) &&
    context.originModulePath.includes(`${path.sep}@reown${path.sep}`)
  ) {
    try {
      return {
        type: "sourceFile",
        filePath: require.resolve(moduleName, { paths: [reownValtioBase] }),
      };
    } catch {
      // fall through to the default resolver below
    }
  }

  // Anchor via Metro (not require.resolve) so it still picks each package's
  // react-native build.
  if (
    WC_SINGLETONS.some(
      (p) => moduleName === p || moduleName.startsWith(`${p}/`)
    )
  ) {
    return context.resolveRequest(
      { ...context, originModulePath: rootAnchor },
      moduleName,
      platform
    );
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
