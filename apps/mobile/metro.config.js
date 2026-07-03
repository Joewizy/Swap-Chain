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
//    `@railglide/shared` source at packages/shared, and give the resolver BOTH
//    node_modules roots. The Reown AppKit packages install split across
//    apps/mobile/node_modules and the root, and several import siblings from
//    their `src/` entry — without both search paths Metro can't resolve them
//    (e.g. @reown/appkit-common-react-native, react-native-modal). expo-doctor
//    flags this override, but the split layout genuinely requires it.
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

// 3. valtio singleton dedup. Reown AppKit's controllers are valtio-proxy state
//    singletons; every @reown package must share ONE valtio instance or the
//    state written by createAppKit is invisible to <AppKit/>. The RN packages
//    want valtio 1.13.2, but `@reown/appkit-scaffold-react-native` (which holds
//    <AppKit/>) declares no valtio dep and falls through to the root valtio 2.x
//    that the web app's @chainrails/react pulls in — a 1.x/2.x split that crashes
//    <AppKit/> with "Cannot convert undefined value to object". Force every
//    @reown importer to the same 1.13.2 copy.
const reownValtioBase = path.resolve(
  workspaceRoot,
  "node_modules/@reown/appkit-core-react-native"
);
// The stateful WalletConnect relay singletons to force to a single root copy,
// and a fake root-level module path to anchor their resolution there.
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

  // 4. WalletConnect singleton dedup. @walletconnect/core, sign-client, and
  //    universal-provider are stateful relay singletons. npm left duplicate
  //    copies (root 2.21.1 + nested 2.21.0 under @reown/appkit*), so the sign
  //    response can land on a different `core` than the one signMessageAsync
  //    awaits — "emitting session_request without any listeners", and the sign
  //    hangs forever. Anchor these three at the root so every importer shares
  //    one copy. Resolve through Metro (not require.resolve) so it still picks
  //    each package's `react-native` build — a blanket require.resolve grabbed
  //    the Node/fs build of @walletconnect/keyvaluestorage and broke the bundle.
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
