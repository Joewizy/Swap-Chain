// Entry point. Polyfills MUST be the first import so any Web3 shims are
// installed before wallet/viem code runs (see src/polyfills.ts).
import "./src/polyfills";

import { registerRootComponent } from "expo";
import App from "./App";

registerRootComponent(App);
