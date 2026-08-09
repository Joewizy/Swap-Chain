"use client";

/**
 * ChainrailsStatus — creates a hosted Chainrails on-ramp order, opens the
 * provider's checkout, and polls the order until it reaches a terminal state.
 *
 * Replaces the earlier fire-and-forget redirect: we keep the app mounted so
 * the user comes back to a live status instead of a blank page. The created
 * order id is cached (localStorage) so a refresh resumes polling the same
 * order rather than creating a duplicate.
 */

import React, { useEffect, useRef, useState } from "react";
import {
  classifyRampStatus,
  isRampPhaseTerminal,
  rampTxUrl,
  type RampOrderPhase,
} from "@/rails/chainrails";
import { type Intent } from "../SendScreen";
import { Icon } from "../icons";
import { linkRampOrder, trackRampOrder } from "../chainrailsOrders";
import { loadSavedEmail } from "../rampEmail";
import { getTokenIcon } from "@/utils/icons";
import { pollRampOrder } from "@/lib/chainrailsPoll";

/** Colored Iconify name for a token/chain, or null when there's no real logo. */
function assetIconify(name: string): string | null {
  if (name.startsWith("material-symbols:")) return null; // generic fallback
  return name.startsWith("cryptocurrency:")
    ? name.replace("cryptocurrency:", "cryptocurrency-color:")
    : name;
}

/** Real token/chain logo via the Iconify SVG API; hides itself if it 404s. */
function AssetLogo({ name, size }: { name: string | null; size: number }) {
  if (!name) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://api.iconify.design/${name}.svg`}
      width={size}
      height={size}
      alt=""
      loading="lazy"
      style={{ display: "block", borderRadius: 999, flex: "0 0 auto" }}
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

/** The live order fields we read back from GET /ramp/orders/:id. */
type RampOrder = {
  id: number | string;
  status: string;
  provider?: string;
  fiatCurrency?: string;
  fiatAmount?: number;
  cryptoCurrency?: string;
  cryptoAmount?: number;
  destinationChain?: string;
  recipientAddress?: string;
  widgetUrl?: string;
  expiresAt?: string;
  providerTxHash?: string | null;
};

/** Cached so a refresh resumes the same order instead of creating another. */
type CachedOrder = {
  key: string;
  id: string;
  widgetUrl?: string;
  createdAt: number;
  expiresAt?: string;
};

const CACHE_KEY = "chainrails:onramp:last";

function readCache(): CachedOrder | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CachedOrder) : null;
  } catch {
    return null;
  }
}

function writeCache(order: CachedOrder) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(order));
  } catch {
    // Non-fatal: without the cache a refresh just creates a new order.
  }
}

function clearCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

/** Still-usable cached order for the same purchase? (not lapsed, < 30 min old) */
function isCacheFresh(cache: CachedOrder, key: string): boolean {
  if (cache.key !== key) return false;
  const expiresMs = cache.expiresAt ? Date.parse(cache.expiresAt) : NaN;
  if (Number.isFinite(expiresMs)) return Date.now() < expiresMs;
  return Date.now() - cache.createdAt < 30 * 60 * 1000;
}

export function ChainrailsStatus({
  intent,
  onDone,
  onStartNew,
}: {
  intent: Intent;
  onDone: () => void;
  /** Start a fresh purchase (→ the Buy page). Falls back to onDone. */
  onStartNew?: () => void;
}) {
  const exec = intent.quote.exec;
  const ramp = exec.chainrailsRamp;
  const startNew = onStartNew ?? onDone;

  const [orderId, setOrderId] = useState<string | null>(null);
  const [widgetUrl, setWidgetUrl] = useState<string | null>(null);
  const [order, setOrder] = useState<RampOrder | null>(null);
  const [phase, setPhase] = useState<RampOrderPhase>("pending");
  // We only poll once there's something to learn: after the user opens the
  // checkout, or when resuming an order from History. Before that the sole
  // possible change is expiry, which the local countdown handles.
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  // Only the setter is read now — "still creating" is derived from `orderId`.
  const [, setCreating] = useState(true);

  // A stable identity for this purchase so a refresh reuses the same order.
  const purchaseKey =
    ramp && exec.recipient
      ? [
          ramp.provider,
          ramp.countryCode,
          exec.fiatCurrency,
          ramp.cryptoAmount,
          ramp.destinationChain,
          exec.recipient,
        ].join("|")
      : null;

  const startedRef = useRef(false);

  // --- Create (or resume) the order, exactly once. ------------------------
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    // Resume/view an existing order from History — poll only, never re-create.
    // The poll fills the checkout URL; the user re-opens it with the button.
    if (intent.resumeOrderId) {
      setOrderId(intent.resumeOrderId);
      setCreating(false);
      // A resumed order may already be paid — poll once on mount, then cadence.
      setPolling(true);
      return;
    }

    if (!ramp || !exec.recipient || !purchaseKey) {
      setError(
        "The live ramp quote or destination wallet is missing. Go back and get a new quote."
      );
      setCreating(false);
      return;
    }
    const destinationChain = ramp.destinationChain;

    // Resume a still-valid cached order rather than creating a duplicate. This
    // is the refresh path, so start polling straight away — otherwise the page
    // comes back but the status sits frozen until the user prods it.
    const cached = readCache();
    if (cached && isCacheFresh(cached, purchaseKey)) {
      setOrderId(cached.id);
      setWidgetUrl(cached.widgetUrl ?? null);
      setCreating(false);
      setPolling(true);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/chainrails/ramp/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: ramp.provider,
            fiatCurrency: exec.fiatCurrency,
            cryptoAmount: ramp.cryptoAmount,
            destinationChain,
            recipientAddress: exec.recipient,
            countryCode: ramp.countryCode,
            ...(ramp.paymentChannelId
              ? { paymentChannelId: ramp.paymentChannelId }
              : {}),
            ...(ramp.fields && Object.keys(ramp.fields).length
              ? { fields: ramp.fields }
              : {}),
          }),
        });
        const data = (await res.json()) as RampOrder & { error?: string };
        if (!res.ok)
          throw new Error(data?.error || "Couldn't create the ramp order.");
        if (data.id == null)
          throw new Error("The provider didn't return an order id.");

        const id = String(data.id);
        // Persist FIRST, regardless of mount state: the order now exists
        // upstream, so it must reach the cache + History even if this effect was
        // torn down (React StrictMode remounts in dev, setting `cancelled`).
        writeCache({
          key: purchaseKey,
          id,
          widgetUrl: data.widgetUrl,
          createdAt: Date.now(),
          expiresAt: data.expiresAt,
        });
        trackRampOrder({
          id,
          direction: "onramp",
          chainLabel: ramp.destinationLabel,
          cryptoLabel: `${data.cryptoAmount ?? ramp.cryptoAmount} ${data.cryptoCurrency ?? "USDC"}`,
          fiatLabel:
            data.fiatAmount != null
              ? `${data.fiatAmount.toLocaleString()} ${data.fiatCurrency ?? exec.fiatCurrency ?? ""}`
              : undefined,
          address: exec.recipient ?? undefined,
          createdAt: Date.now(),
        });
        // Tie it to the saved email for cross-device history.
        linkRampOrder(id, loadSavedEmail());

        // Update state unconditionally — in StrictMode the second run returns
        // early on `startedRef`, so this (first) run must set state on the live
        // instance. A setState after a real unmount is a harmless no-op in R18.
        setOrderId(id);
        setWidgetUrl(data.widgetUrl ?? null);
        setOrder(data);
        setPhase(classifyRampStatus(data.status));
      } catch (err) {
        if (!cancelled)
          setError(
            err instanceof Error
              ? err.message
              : "Couldn't create the ramp order."
          );
      } finally {
        if (!cancelled) setCreating(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The hosted checkout is opened from the button below (a user gesture),
  // never auto-opened — browsers block window.open outside a click, so an
  // auto-open just silently fails. `openWidget` is called on click.

  // --- Poll the order, but only once it's worth watching. The shared poller
  //     polls immediately, backs off toward 30s, pauses while the tab is hidden
  //     (the whole time they're in the checkout tab), fires instantly on return,
  //     and stops at a terminal state. Keyed on the id so refreshing the order
  //     each tick doesn't re-arm it. ------------------------------------------
  useEffect(() => {
    if (!polling || !orderId) return;
    const handle = pollRampOrder<RampOrder>(orderId, {
      onUpdate: (data) => {
        setOrder(data);
        setPhase(classifyRampStatus(data.status));
        // Resumed orders start without a checkout URL — adopt it from the order.
        if (data.widgetUrl)
          setWidgetUrl((cur) => cur ?? data.widgetUrl ?? null);
      },
      onSettled: (data, settledPhase) => {
        if (data) setOrder(data);
        setPhase(settledPhase);
      },
    });
    return () => handle.stop();
  }, [polling, orderId]);

  // Terminal orders shouldn't be resumed from cache on the next visit.
  useEffect(() => {
    if (isRampPhaseTerminal(phase)) clearCache();
  }, [phase]);

  // Keep the checkout deadline live and flip to expired locally when it lapses —
  // so a never-opened order still resolves without any network poll.
  useEffect(() => {
    if (!order?.expiresAt || isRampPhaseTerminal(phase)) return;
    const expiresAt = Date.parse(order.expiresAt);
    const id = setInterval(() => {
      setNow(Date.now());
      if (Number.isFinite(expiresAt) && Date.now() >= expiresAt)
        setPhase("expired");
    }, 1000);
    return () => clearInterval(id);
  }, [order?.expiresAt, phase]);

  // Optional manual refresh — an immediate one-off check, and make sure the
  // background cadence is running from here on.
  const checkNow = async () => {
    if (!orderId) return;
    setPolling(true);
    try {
      const res = await fetch(`/api/chainrails/ramp/orders/${orderId}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as RampOrder | null;
      if (!data) return;
      setOrder(data);
      setPhase(classifyRampStatus(data.status));
    } catch {
      /* ignore — the poller retries */
    }
  };

  // ----- Presentation -----------------------------------------------------
  const chainName = ramp?.destinationLabel ?? "your chain";
  const cryptoCurrency = order?.cryptoCurrency ?? "USDC";
  const tokenIcon = assetIconify(getTokenIcon(cryptoCurrency));
  const cryptoLabel =
    order?.cryptoAmount != null
      ? `${order.cryptoAmount} ${cryptoCurrency}`
      : ramp
        ? `${ramp.cryptoAmount} USDC`
        : "USDC";
  const fiatLabel =
    order?.fiatAmount != null
      ? `${order.fiatAmount.toLocaleString()} ${order.fiatCurrency ?? exec.fiatCurrency ?? ""}`
      : // Fall back to the quote's fiat amount so "You pay" shows immediately,
        // instead of "—", while the order is still being created.
        exec.fromAmount
        ? `${Number(exec.fromAmount).toLocaleString()} ${exec.fiatCurrency ?? ""}`
        : null;

  const view = PHASE_VIEW[phase];
  const terminal = isRampPhaseTerminal(phase);
  const done = phase === "completed";
  // On-chain delivery tx, once the provider reports one (chains we have an
  // explorer for). Lets the user verify the USDC actually landed.
  const txUrl = ramp
    ? rampTxUrl(ramp.destinationChain, order?.providerTxHash)
    : null;
  const orderCreated = !!orderId;
  const expiryMs = order?.expiresAt ? Date.parse(order.expiresAt) : NaN;
  const expiresIn = Number.isFinite(expiryMs)
    ? formatRemaining(expiryMs - now)
    : null;

  // Plain-language steps (mirrors the Paycrest progress panel).
  const steps: { l: string; d: string }[] = [
    { l: "Order created", d: "Your quote is locked and the order is set up." },
    {
      l: "Pay in the checkout",
      d: "Complete the payment in the provider's secure checkout tab.",
    },
    {
      l: "Confirming payment",
      d: "We'll confirm your payment and send your USDC.",
    },
    { l: "Received", d: `USDC delivered to your wallet on ${chainName}.` },
  ];
  // Base the timeline on the REAL state, not an optimistic default: nothing is
  // "done" until the order actually exists (has an id).
  let activeIndex: number;
  let failedIndex = -1;
  if (error || phase === "expired" || phase === "failed") {
    // Failed before creation → step 0; after creation → the payment step.
    failedIndex = orderCreated ? 1 : 0;
    activeIndex = failedIndex;
  } else if (!orderCreated) {
    activeIndex = 0; // still creating the order
  } else if (done) {
    activeIndex = steps.length;
  } else if (phase === "processing") {
    activeIndex = 2;
  } else {
    activeIndex = 1; // order exists, waiting for payment
  }
  const failedPhase = failedIndex >= 0;
  const payLabel =
    phase === "processing" || phase === "completed" ? "You paid" : "You pay";

  // Terminal-failure states get a reassuring card in place of the amount cards
  // (matches the Paycrest order screen), so a dead order doesn't just sit there
  // showing figures the user can no longer act on.
  const isTerminalFailure =
    !!error || phase === "expired" || phase === "failed";
  const failView: { chip: string; body: string; note?: string } = error
    ? { chip: "Stalled", body: error }
    : phase === "expired"
      ? {
          chip: "Expired",
          body: "The payment window has closed and this quote is no longer valid.",
          note: "Already paid? Your payment will be refunded.",
        }
      : {
          chip: "Failed",
          body: "The provider couldn't process this order.",
          note: "Already paid? Your payment will be refunded.",
        };

  return (
    <div className="cr-status col">
      <button
        className="btn btn-quiet btn-sm"
        onClick={onDone}
        style={{ padding: "0 8px", alignSelf: "flex-start", marginBottom: 4 }}
      >
        <Icon.Arrow rotate={180} size={12} /> Back
      </button>
      <header className="cr-status-header col">
        <span className="row center gap-2">
          <span className="eyebrow">Status</span>
          {isTerminalFailure && (
            <span className="chip chip-err">{failView.chip}</span>
          )}
        </span>
        <h1
          style={{
            fontSize: "clamp(32px, 4vw, 44px)",
            lineHeight: 1.02,
            letterSpacing: "-0.035em",
            fontWeight: 500,
          }}
        >
          {error
            ? "Order stalled"
            : !orderCreated
              ? "Setting up your order…"
              : view.title}
        </h1>
        {!isTerminalFailure && (
          <span className="muted" style={{ fontSize: 14, lineHeight: 1.4 }}>
            {!orderCreated
              ? "Locking your quote and creating the order."
              : view.subtitle(cryptoLabel, chainName)}
          </span>
        )}
      </header>

      <div className="cr-status-grid">
        {/* Left — two amount cards, action, order reference */}
        <div className="cr-status-main">
          {/* On a dead order the figures stay for context but fade back — the
              reassurance card below carries the action (mirrors Paycrest). */}
          <div
            className="cr-status-amounts"
            style={isTerminalFailure ? { opacity: 0.5 } : undefined}
          >
            {/* You pay */}
            <div className="card cr-status-amount">
              <span className="eyebrow">{payLabel}</span>
              <span className="font-mono tabular cr-status-amount-value">
                {fiatLabel ?? "—"}
              </span>
              <span className="muted" style={{ fontSize: 12 }}>
                With local currency
              </span>
            </div>
            {/* You receive */}
            <div className="card cr-status-amount">
              <span className="eyebrow">You receive</span>
              <span
                className="font-mono tabular row center gap-2 cr-status-amount-value"
                style={{ color: "var(--accent)", whiteSpace: "nowrap" }}
              >
                <AssetLogo name={tokenIcon} size={18} />
                {cryptoLabel}
              </span>
              <span
                className="muted"
                style={{
                  fontSize: 12,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                On {chainName}
                {exec.recipient ? ` · ${shortAddr(exec.recipient)}` : ""}
              </span>
            </div>
          </div>

          {isTerminalFailure && (
            <div
              className="card"
              style={{
                padding: 20,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  color: "var(--fg-soft)",
                  lineHeight: 1.55,
                }}
              >
                {failView.body}
              </span>
              {failView.note && (
                <span style={{ fontSize: 14, fontWeight: 600 }}>
                  {failView.note}
                </span>
              )}
            </div>
          )}

          {phase === "completed" ? (
            <button
              className="btn btn-primary cr-status-action"
              onClick={onDone}
            >
              Done
            </button>
          ) : phase === "expired" || phase === "failed" || error ? (
            // The order can't be continued — send the user back to buy.
            <button
              className="btn btn-primary cr-status-action"
              onClick={startNew}
            >
              Start new order <Icon.ArrowRight />
            </button>
          ) : widgetUrl ? (
            // A real link (never popup-blocked) to the Chainrails/provider
            // checkout where the order is completed.
            <a
              className="btn btn-primary cr-status-action"
              href={widgetUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: "none" }}
              onClick={() => setPolling(true)}
            >
              Continue your order <Icon.ArrowRight />
            </a>
          ) : (
            <button
              className="btn btn-primary cr-status-action"
              onClick={startNew}
            >
              Start new order <Icon.ArrowRight />
            </button>
          )}

          {txUrl && (
            <a
              className="btn btn-quiet btn-sm"
              href={txUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ alignSelf: "center", textDecoration: "none" }}
            >
              View transaction <Icon.ArrowRight />
            </a>
          )}

          {polling && !terminal && (
            <button
              className="btn btn-quiet btn-sm"
              onClick={() => void checkNow()}
              style={{ alignSelf: "center" }}
            >
              Check status
            </button>
          )}

          {orderId && (
            <div
              className="cr-status-ref"
              style={{
                justifyContent:
                  !terminal && expiresIn ? "space-between" : "center",
              }}
            >
              {!terminal && expiresIn && (
                <span
                  className="font-mono tabular"
                  style={{ color: "var(--pend)" }}
                >
                  Expires in {expiresIn}
                </span>
              )}
              <CopyableOrderId id={orderId} />
            </div>
          )}
        </div>

        {/* Right — progress timeline */}
        <div className="card cr-status-card cr-status-progress">
          <span className="eyebrow">Progress</span>
          {steps.map((s, i) => {
            const isFailed = failedIndex === i;
            // Steps before the failed one stay done (e.g. order was created,
            // then the payment step expired).
            const isDone = failedPhase
              ? i < failedIndex
              : done || i < activeIndex;
            const isActive = !failedPhase && !done && i === activeIndex;
            const statusLabel = isFailed
              ? phase === "expired"
                ? "expired"
                : "failed"
              : isDone
                ? "done"
                : isActive
                  ? "now"
                  : "next";
            const dim = !isDone && !isActive && !isFailed ? 0.5 : 1;
            // The failed step must read as failed — not still ask the user to
            // "complete the payment" after the window has already closed.
            const label = isFailed
              ? phase === "expired"
                ? "Payment window expired"
                : "Payment couldn't be completed"
              : s.l;
            const desc = isFailed
              ? "This payment can no longer be completed."
              : s.d;
            return (
              <div
                key={i}
                className="row"
                style={{
                  gap: 12,
                  paddingBottom: i < steps.length - 1 ? 12 : 0,
                  alignItems: "flex-start",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    flex: "0 0 20px",
                  }}
                >
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: isFailed
                        ? "var(--err)"
                        : isDone
                          ? "var(--ok)"
                          : isActive
                            ? "var(--accent)"
                            : "var(--bg-sunk)",
                      color:
                        isDone || isActive || isFailed
                          ? "#fff"
                          : "var(--fg-mute)",
                      border:
                        !isDone && !isActive && !isFailed
                          ? "1px solid var(--line-2)"
                          : "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      animation:
                        isActive && !isFailed
                          ? "pulse-ring 1.4s var(--ease) infinite"
                          : "none",
                    }}
                  >
                    {isFailed ? (
                      <span style={{ fontSize: 12 }}>!</span>
                    ) : isDone ? (
                      <Icon.Check size={11} />
                    ) : (
                      <span className="font-mono" style={{ fontSize: 10 }}>
                        {i + 1}
                      </span>
                    )}
                  </div>
                  {i < steps.length - 1 && (
                    <div
                      style={{
                        width: 1,
                        flex: 1,
                        minHeight: 16,
                        background: isDone ? "var(--ok)" : "var(--line)",
                        marginTop: 3,
                      }}
                    />
                  )}
                </div>
                <div className="col grow gap-1" style={{ opacity: dim }}>
                  <div
                    className="row between"
                    style={{ alignItems: "baseline" }}
                  >
                    <h4
                      style={{
                        fontSize: 13.5,
                        lineHeight: 1.25,
                        fontWeight: 500,
                      }}
                    >
                      {label}
                    </h4>
                    <span
                      className="font-mono"
                      style={{
                        fontSize: 9,
                        color: "var(--fg-mute)",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        lineHeight: 1,
                      }}
                    >
                      {statusLabel}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 12,
                      lineHeight: 1.4,
                      color: "var(--fg-soft)",
                    }}
                  >
                    {desc}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

/** Order number that copies to the clipboard on tap — useful for support. */
function CopyableOrderId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard
          ?.writeText(id)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          })
          .catch(() => {})
      }
      className="font-mono muted transition-colors hover:text-[var(--fg)]"
      title="Copy order number"
      aria-label="Copy order number"
      style={{
        background: "transparent",
        border: 0,
        padding: 0,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
      }}
    >
      Order #{id}
      {copied ? <Icon.Check size={11} /> : <Icon.Copy size={11} />}
    </button>
  );
}

function formatRemaining(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "00:00";
  const total = Math.ceil(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

const PHASE_VIEW: Record<
  RampOrderPhase,
  { title: string; subtitle: (crypto: string, chain: string) => string }
> = {
  pending: {
    title: "Waiting for payment",
    subtitle: (c, ch) => `Pay in the checkout to receive ${c} on ${ch}.`,
  },
  processing: {
    title: "Payment received",
    subtitle: (c, ch) => `Delivering ${c} to your wallet on ${ch}.`,
  },
  completed: {
    title: "Received.",
    subtitle: (c, ch) => `${c} was delivered to your wallet on ${ch}.`,
  },
  expired: {
    title: "Payment window expired",
    subtitle: () => "The order lapsed before payment cleared. Start a new one.",
  },
  failed: {
    title: "Order didn't go through",
    subtitle: () => "The provider couldn't complete this order.",
  },
  unknown: {
    title: "Order in progress",
    subtitle: (c, ch) => `Tracking your purchase of ${c} on ${ch}.`,
  },
};
