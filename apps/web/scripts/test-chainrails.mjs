import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Chainrails, crapi } from "@chainrails/sdk";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");

// USDC addresses mirror src/config/network.ts. Update both together.
const USDC = {
  baseSepolia: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  arbitrumSepolia: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
};

const TEST_WALLET = "0xa2791e44234Dc9C96F260aD15fdD09Fe9B597FE1";

const fixture = {
  sourceChain: "BASE_TESTNET",
  destinationChain: "ARBITRUM_TESTNET",
  tokenIn: USDC.baseSepolia,
  tokenOut: USDC.arbitrumSepolia,
  amount: "1000000", // 1 USDC, 6 decimals
  sender: TEST_WALLET,
  recipient: TEST_WALLET,
  amountSymbol: "USDC",
};

const commands = {
  chains: {
    run: showSupportedChains,
    description: "List Chainrails testnet chains",
  },
  quote: { run: showQuotes, description: "Best quote + per-bridge breakdown" },
  intent: {
    run: createAndFetchIntent,
    description: "Create an intent and read it back (WRITE)",
  },
  all: { run: runReadOnlySuite, description: "chains + quote (default)" },
};

run();

// --- entry point ------------------------------------------------------------

async function run() {
  const [, , commandName = "all", ...rest] = process.argv;

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

  loadDotenv(resolve(projectRoot, ".env.local"));

  const apiKey = process.env.CHAINRAILS_API_KEY;
  if (!apiKey) {
    console.error(
      "CHAINRAILS_API_KEY is not set. Add it to railglide/.env.local."
    );
    process.exit(1);
  }
  Chainrails.config({ api_key: apiKey });

  try {
    await command.run(rest);
  } catch (error) {
    await reportError(error);
    process.exit(1);
  }
}

// --- commands ---------------------------------------------------------------

async function runReadOnlySuite() {
  await showSupportedChains();
  await showQuotes();
}

async function showSupportedChains() {
  heading("Supported testnet chains");
  const chains = await crapi.chains.getSupported({ network: "testnet" });
  printJson(chains);
}

async function showQuotes() {
  heading("Quote inputs");
  printJson(fixture);

  heading("Best quote across bridges");
  const best = await crapi.quotes.getBestAcrossBridges(quoteRequest());
  printJson(best);

  heading("Per-bridge quote breakdown");
  const all = await crapi.quotes.getFromAllBridges({
    ...quoteRequest(),
    excludeBridges: "",
  });
  printJson(all);
}

async function createAndFetchIntent() {
  await showQuotes();

  // NOTE (2026-06-09): on TESTNET, POST /api/v1/intents returns a server-side 500
  // ("Failed to create intent") at api.chainrails.io even for a valid, schema-
  // passing payload. The SAME call on MAINNET succeeds (verified — returned a real
  // intent id). So this is a testnet-specific Chainrails backend bug, not a problem
  // with this script or the SDK: quotes/reads work on both networks, and garbage
  // input correctly 400s, so our payload passes validation and their testnet
  // handler then throws. Track with Chainrails; remove this note once testnet
  // intent creation works again.
  heading("Create intent");
  const intent = await crapi.intents.create({
    sender: fixture.sender,
    amount: fixture.amount,
    tokenIn: fixture.tokenIn,
    amountSymbol: fixture.amountSymbol,
    source_chain: fixture.sourceChain,
    destination_chain: fixture.destinationChain,
    recipient: fixture.recipient,
    refund_address: fixture.sender,
    metadata: {
      description: "railglide backend smoke test",
      reference: `test-${Date.now()}`,
    },
  });
  printJson(intent);

  heading(`Fetch intent ${intent.id}`);
  const fetched = await crapi.intents.getById(String(intent.id));
  printJson(fetched);
}

// --- helpers ----------------------------------------------------------------

function quoteRequest() {
  return {
    sourceChain: fixture.sourceChain,
    destinationChain: fixture.destinationChain,
    tokenIn: fixture.tokenIn,
    tokenOut: fixture.tokenOut,
    amount: fixture.amount,
    recipient: fixture.recipient,
    amountSymbol: fixture.amountSymbol,
  };
}

function loadDotenv(path) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (key in process.env) continue;
    process.env[key] = stripQuotes(rawValue);
  }
}

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

function heading(title) {
  const bar = "─".repeat(60);
  console.log(`\n${bar}\n${title}\n${bar}`);
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

async function reportError(error) {
  console.error(`\nRequest failed: ${error?.message ?? error}`);
  const response = error?.response;
  if (!response) return;
  try {
    console.error("Response body:", await response.text());
  } catch {
    // body already consumed or unavailable
  }
}

function printUsage() {
  console.log("Usage: node scripts/test-chainrails.mjs [command]\n");
  console.log("Commands:");
  for (const [name, { description }] of Object.entries(commands)) {
    console.log(`  ${name.padEnd(8)} ${description}`);
  }
}
