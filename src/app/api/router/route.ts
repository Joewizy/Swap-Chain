import { NextRequest, NextResponse } from "next/server";
import {
  resolveChain,
  resolveToken,
  type ChainId,
  type TokenSymbol,
} from "@/config/network";
import {
  NoRailError,
  selectRail,
  type RailDecision,
  type RailName,
  type RouteAction,
} from "@/rails/router";
import { fetchBurnFees } from "@/rails/cctp";

/**
 * POST /api/router
 *
 * The rail router. Given a normalised transfer intent it picks the
 * cheapest rail (CCTP / Chainrails / Relay / Paycrest) and either:
 *   - returns a live CCTP burn-fee quote inline — Circle's Iris API
 *     needs no key, and a route's fee schedule is intent-level; or
 *   - hands back the endpoint to call for that rail's live quote, since
 *     Chainrails / Relay / Paycrest quotes need execution-level params
 *     (a recipient, a wallet address) the routing intent doesn't carry.
 *
 * `/api/quote` stays the Relay-specific endpoint; this route is the
 * multi-rail front door.
 *
 * Body: { action, fromChain, fromToken, amount, toChain?, toToken?,
 *         fiatCurrency? }
 */

const VALID_ACTIONS: RouteAction[] = ["bridge", "swap", "offramp", "onramp"];

/** Where to fetch each rail's live quote, when it isn't returned inline. */
const QUOTE_ENDPOINT: Partial<Record<RailName, string>> = {
  chainrails: "/api/chainrails/quote",
  relay: "/api/quote",
  paycrest: "/api/paycrest/order",
};

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // --- action ------------------------------------------------------------
  const action = body.action;
  if (
    typeof action !== "string" ||
    !VALID_ACTIONS.includes(action as RouteAction)
  ) {
    return NextResponse.json(
      { error: `action must be one of: ${VALID_ACTIONS.join(", ")}` },
      { status: 400 }
    );
  }

  // --- source chain + token ---------------------------------------------
  const fromChain: ChainId | undefined =
    typeof body.fromChain === "string"
      ? resolveChain(body.fromChain)
      : undefined;
  if (!fromChain) {
    return NextResponse.json(
      { error: `Unknown source chain "${String(body.fromChain)}"` },
      { status: 400 }
    );
  }
  const fromToken: TokenSymbol | undefined =
    typeof body.fromToken === "string"
      ? resolveToken(body.fromToken)
      : undefined;
  if (!fromToken) {
    return NextResponse.json(
      { error: `Unknown source token "${String(body.fromToken)}"` },
      { status: 400 }
    );
  }

  // --- amount ------------------------------------------------------------
  if (typeof body.amount !== "string" || !(Number(body.amount) > 0)) {
    return NextResponse.json(
      { error: "amount must be a positive decimal string" },
      { status: 400 }
    );
  }
  const amount = body.amount;

  // --- optional destination ---------------------------------------------
  let toChain: ChainId | undefined;
  if (body.toChain !== undefined) {
    toChain =
      typeof body.toChain === "string" ? resolveChain(body.toChain) : undefined;
    if (!toChain) {
      return NextResponse.json(
        { error: `Unknown destination chain "${String(body.toChain)}"` },
        { status: 400 }
      );
    }
  }
  let toToken: TokenSymbol | undefined;
  if (body.toToken !== undefined) {
    toToken =
      typeof body.toToken === "string" ? resolveToken(body.toToken) : undefined;
    if (!toToken) {
      return NextResponse.json(
        { error: `Unknown destination token "${String(body.toToken)}"` },
        { status: 400 }
      );
    }
  }
  const fiatCurrency =
    typeof body.fiatCurrency === "string" ? body.fiatCurrency : undefined;

  // --- pick the rail -----------------------------------------------------
  let decision: RailDecision;
  try {
    decision = selectRail({
      action: action as RouteAction,
      fromChain,
      fromToken,
      amount,
      toChain,
      toToken,
      fiatCurrency,
    });
  } catch (err) {
    if (err instanceof NoRailError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Routing failed" },
      { status: 500 }
    );
  }

  const echo = {
    action,
    fromChain,
    fromToken,
    amount,
    toChain: toChain ?? null,
    toToken: toToken ?? fromToken,
    fiatCurrency: fiatCurrency ?? null,
  };

  // --- CCTP: return a live burn-fee quote inline -------------------------
  if (decision.rail === "cctp" && toChain) {
    try {
      const fees = await fetchBurnFees(fromChain, toChain);
      return NextResponse.json({
        ...decision,
        request: echo,
        quote: { rail: "cctp" as const, fees },
        quoteEndpoint: null,
      });
    } catch (error) {
      return NextResponse.json(
        {
          ...decision,
          request: echo,
          quote: null,
          quoteEndpoint: null,
          quoteError:
            error instanceof Error ? error.message : "CCTP fee lookup failed",
        },
        { status: 502 }
      );
    }
  }

  // --- other rails: hand back the endpoint to call -----------------------
  return NextResponse.json({
    ...decision,
    request: echo,
    quote: null,
    quoteEndpoint: QUOTE_ENDPOINT[decision.rail] ?? null,
  });
}
