/**
 * Circle CCTP v2 smoke-test CLI
 * =============================
 *
 * A tiny, no-dependency tool for poking the Circle CCTP v2 attestation
 * service (Iris) and printing the constants the rail relies on. It exists
 * so we can validate our integration end-to-end *before* wiring the burn
 * flow into the Next.js UI.
 *
 * Why CCTP at all?
 * ----------------
 * CCTP (Cross-Chain Transfer Protocol) is Circle's native USDC bridge.
 * Unlike third-party bridges, it does not pool liquidity — it burns USDC
 * on the source chain and mints fresh USDC on the destination chain.
 * That makes it the cheapest path for any USDC → USDC outbound transfer
 * we route (see ARCHITECTURE.md §4, "When Relay still wins (outbound)").
 *
 * The on-chain flow (what the UI will eventually do):
 *
 *     ┌─────────────┐  approve   ┌──────────────────┐
 *     │  user EOA   │──────────▶│  USDC (source)    │
 *     └─────────────┘            └──────────────────┘
 *           │
 *           │ depositForBurn(amount, dstDomain, recipient32,
 *           │                USDC, 0, maxFee, finalityThreshold)
 *           ▼
 *     ┌──────────────────────────┐
 *     │  TokenMessengerV2 (src)  │   burns USDC, emits MessageSent
 *     └──────────────────────────┘
 *           │
 *           │  Circle's off-chain attestation service
 *           ▼
 *     ┌──────────────────────────┐
 *     │  Iris API                │   /v2/messages/{srcDomain}?...
 *     │  signs the burn message  │   status: pending → complete
 *     └──────────────────────────┘
 *           │
 *           │  receiveMessage(message, attestation)
 *           ▼
 *     ┌─────────────────────────────────┐
 *     │  MessageTransmitterV2 (dst)     │   mints USDC to recipient
 *     └─────────────────────────────────┘
 *
 * What this script actually does:
 *   - `context`   prints addresses + domain IDs for the active network.
 *                 No network call — useful as a constants sanity check.
 *   - `fees`      hits Iris `/v2/burn/USDC/fees/{src}/{dst}` to show the
 *                 current Fast vs Standard transfer fees for a route.
 *   - `attest`    polls Iris with an existing source-chain tx hash until
 *                 the attestation is ready (status: "complete"). Use
 *                 this after a real burn to verify the round-trip works.
 *
 * The burn and receive transactions live in the wagmi client hook
 * (`useCctpBurn` / `useCctpReceive`, not yet written). They need user
 * signatures, so they intentionally are NOT in this Node-side script.
 *
 * Usage:
 *   node scripts/test-cctp.mjs                                   # context
 *   node scripts/test-cctp.mjs fees base-sepolia arbitrum-sepolia
 *   node scripts/test-cctp.mjs attest base-sepolia 0xabc…        # poll
 *   NEXT_PUBLIC_NETWORK=mainnet node scripts/test-cctp.mjs fees ethereum polygon
 *
 * Reads `NEXT_PUBLIC_NETWORK` from `swap-chain/.env.local` if present.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");

// ---------------------------------------------------------------------------
// Constants — duplicated from src/rails/cctp.ts so this script has zero
// build deps and runs as plain Node. Update both files together.
// ---------------------------------------------------------------------------

const NETWORK = (process.env.NEXT_PUBLIC_NETWORK || "testnet").toLowerCase();
const IS_MAINNET = NETWORK === "mainnet";

// Circle's attestation service. The hostname differs per network because
// mainnet keys cannot read from the sandbox and vice versa.
const IRIS = IS_MAINNET
  ? "https://iris-api.circle.com"
  : "https://iris-api-sandbox.circle.com";

// CCTP v2 ships the same address on every supported EVM chain within one
// network — there are only two TokenMessenger contracts in the whole world:
// one mainnet, one testnet.
const TOKEN_MESSENGER = IS_MAINNET
  ? "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d"
  : "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA";

const MESSAGE_TRANSMITTER = IS_MAINNET
  ? "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64"
  : "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275";

// Circle "domain" IDs are CCTP's own chain identifiers — independent of
// EVM chain IDs. Every depositForBurn and Iris call references them.
const DOMAINS = IS_MAINNET
  ? {
      ethereum: 0,
      avalanche: 1,
      optimism: 2,
      arbitrum: 3,
      base: 6,
      polygon: 7,
    }
  : {
      sepolia: 0,
      "avalanche-fuji": 1,
      "op-sepolia": 2,
      "arbitrum-sepolia": 3,
      "base-sepolia": 6,
      "polygon-amoy": 7,
    };

// ---------------------------------------------------------------------------
// Command table — the CLI dispatcher walks this object so adding a new
// subcommand is a one-entry change.
// ---------------------------------------------------------------------------

const commands = {
  context: {
    run: showContext,
    description: "Print resolved CCTP addresses + domain map",
  },
  fees: {
    run: showFees,
    description: "Burn fees for a route: fees <srcChain> <dstChain>",
  },
  attest: {
    run: pollAttest,
    description: "Poll Iris for an attestation: attest <srcChain> <txHash>",
  },
};

run();

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Resolves the requested command, runs it, and turns thrown errors into
 * a single-line stderr message + non-zero exit code. Keeps `main` boring
 * so the commands themselves can be ordinary async functions.
 */
async function run() {
  loadDotenv(resolve(projectRoot, ".env.local"));
  const [, , commandName = "context", ...rest] = process.argv;

  if (commandName === "--help" || commandName === "-h") {
    printUsage();
    return;
  }

  const command = commands[commandName];
  if (!command) {
    console.error(`Unknown command: ${commandName}`);
    printUsage();
    process.exit(1);
  }

  try {
    await command.run(rest);
  } catch (error) {
    console.error(`\nRequest failed: ${error?.message ?? error}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * Prints every constant the rail relies on for the active network.
 * No network call — useful as a "did I flip NEXT_PUBLIC_NETWORK correctly?"
 * sanity check before running anything else.
 */
async function showContext() {
  heading(`CCTP v2 context — ${NETWORK}`);
  printJson({
    network: NETWORK,
    iris: IRIS,
    tokenMessenger: TOKEN_MESSENGER,
    messageTransmitter: MESSAGE_TRANSMITTER,
    domains: DOMAINS,
  });
}

/**
 * Hits Iris `/v2/burn/USDC/fees/{src}/{dst}` and prints the current fees
 * for a route. The response is a 2-entry array, one per finality threshold:
 *
 *   [
 *     { finalityThreshold: 1000, minimumFee: <bps> },   // Fast (~<60s)
 *     { finalityThreshold: 2000, minimumFee: 0 },       // Standard (~15m)
 *   ]
 *
 * `minimumFee` is in basis points (bps). To compute the `maxFee` argument
 * to depositForBurn for an amount `n` in raw token units:
 *
 *   maxFee = ceil(n * minimumFee / 10_000)
 *
 * Example: burning 1 USDC (1_000_000 raw units) at 1.3 bps →
 *   ceil(1_000_000 * 1.3 / 10_000) = 130 raw units = 0.00013 USDC.
 */
async function showFees([srcChain, dstChain]) {
  if (!srcChain || !dstChain) {
    throw new Error(
      `Usage: fees <srcChain> <dstChain>. Known: ${Object.keys(DOMAINS).join(", ")}`
    );
  }
  const srcDomain = DOMAINS[srcChain];
  const dstDomain = DOMAINS[dstChain];
  if (srcDomain === undefined || dstDomain === undefined) {
    throw new Error(`Unknown chain. Known: ${Object.keys(DOMAINS).join(", ")}`);
  }

  heading(
    `Burn fees — ${srcChain} (${srcDomain}) → ${dstChain} (${dstDomain})`
  );
  const url = `${IRIS}/v2/burn/USDC/fees/${srcDomain}/${dstDomain}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Iris ${res.status}: ${await res.text()}`);
  }
  printJson(await res.json());
}

/**
 * Polls Iris for the attestation associated with a real source-chain burn
 * tx. Iris returns a message immediately (status: "pending_confirmations")
 * and flips it to "complete" once Circle's signers have attested. Fast
 * Transfer typically completes within a minute; Standard waits for full
 * finality (~15 min on Ethereum, faster on L2s).
 *
 * We give up after 30 attempts × 10 s = 5 min. Adjust if you're testing
 * Standard transfers from Ethereum, where 5 min is not enough.
 */
async function pollAttest([srcChain, txHash]) {
  if (!srcChain || !txHash) {
    throw new Error("Usage: attest <srcChain> <txHash>");
  }
  const domain = DOMAINS[srcChain];
  if (domain === undefined) {
    throw new Error(
      `Unknown source chain "${srcChain}". Known: ${Object.keys(DOMAINS).join(", ")}`
    );
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    throw new Error("txHash must be a 0x-prefixed 32-byte hex string");
  }

  const url = `${IRIS}/v2/messages/${domain}?transactionHash=${txHash}`;
  heading(`Polling ${url}`);

  for (let attempt = 1; attempt <= 30; attempt++) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      throw new Error(`Iris ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    const first = data.messages?.[0];
    const status = first?.status ?? "not_found";
    console.log(`[${attempt.toString().padStart(2, "0")}] status=${status}`);

    if (status === "complete") {
      heading("Attestation ready");
      // The `message` + `attestation` fields below are exactly what the
      // destination-chain receiveMessage call needs.
      printJson(first);
      return;
    }
    await sleep(10_000);
  }
  console.error("Gave up after 5 minutes — attestation still not ready.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Tiny zero-dependency .env loader. Reads `KEY=value` lines, ignores
 * comments and blanks, respects pre-existing `process.env` so explicit
 * shell exports always win over the file.
 */
function loadDotenv(path) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return; // .env.local is optional — env may be set in the shell.
  }
  for (const line of raw.split("\n")) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (key in process.env) continue;
    process.env[key] = stripQuotes(rawValue);
  }
}

/** Strips matching surrounding single or double quotes from a string. */
function stripQuotes(value) {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

/** Prints a labeled section divider so multi-step output stays readable. */
function heading(title) {
  const bar = "─".repeat(60);
  console.log(`\n${bar}\n${title}\n${bar}`);
}

/** Pretty-prints a value as 2-space-indented JSON to stdout. */
function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

/** Promise-wrapped setTimeout. */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Builds the --help output from the command table at runtime. */
function printUsage() {
  console.log("Usage: node scripts/test-cctp.mjs [command] [args]\n");
  console.log("Commands:");
  for (const [name, { description }] of Object.entries(commands)) {
    console.log(`  ${name.padEnd(8)} ${description}`);
  }
  console.log("\nEnv:");
  console.log("  NEXT_PUBLIC_NETWORK=testnet|mainnet  (default: testnet)");
}
