"use client";

/**
 * Shared client-side poller for a single ChainRails ramp order — the twin of
 * paycrestPoll for the Chainrails routes.
 *
 * One loop per order id (opening the same order twice can't double-poll). It
 * polls immediately, holds 5s for the first few ticks, then backs off toward
 * 30s, pauses entirely while the tab is hidden or unfocused, and stops the
 * moment the order reaches a terminal state or hits the attempt cap.
 *
 * Callers should only start it once there's something worth watching — i.e.
 * after the user opens the checkout, or when resuming an order from History.
 */

import {
  classifyRampStatus,
  isRampPhaseTerminal,
  type RampOrderPhase,
} from "@/rails/chainrails";

export interface RampPollHandle {
  stop: () => void;
}

export interface RampPollOptions<T extends { status?: string | null }> {
  /** Fresh order snapshot on every successful poll. */
  onUpdate: (order: T) => void;
  /** Fires once when the loop stops, with the final order + phase. */
  onSettled: (order: T | null, phase: RampOrderPhase) => void;
  /** Hard cap on requests before the order is treated as unresolved. */
  maxAttempts?: number;
}

const BASE_INTERVAL_MS = 5_000;
const MAX_INTERVAL_MS = 30_000;
const STEADY_TICKS = 3; // poll at 5s this many times, then start backing off

/** One live poller per order id. */
const active = new Map<string, RampPollHandle>();

export function pollRampOrder<T extends { status?: string | null }>(
  orderId: string | number,
  { onUpdate, onSettled, maxAttempts = 120 }: RampPollOptions<T>
): RampPollHandle {
  const key = String(orderId);
  const running = active.get(key);
  if (running) return running;

  let attempt = 0;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;
  let requestInFlight = false;

  // Awake = tab visible AND window focused — polling while the user is off in
  // the provider's checkout tab would be pure waste.
  const isAwake = () => !document.hidden && (document.hasFocus?.() ?? true);

  // 5s, 5s, 5s, 10s, 20s, 30s, 30s… — quick at first, calm once it drags on.
  const nextDelay = () =>
    attempt <= STEADY_TICKS
      ? BASE_INTERVAL_MS
      : Math.min(
          BASE_INTERVAL_MS * 2 ** (attempt - STEADY_TICKS),
          MAX_INTERVAL_MS
        );

  const schedule = () => {
    if (stopped || timer !== null || requestInFlight) return;
    timer = setTimeout(() => {
      timer = null;
      void tick();
    }, nextDelay());
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timer !== null) clearTimeout(timer);
    controller?.abort();
    document.removeEventListener("visibilitychange", onActivityChange);
    window.removeEventListener("focus", onActivityChange);
    window.removeEventListener("blur", onActivityChange);
    active.delete(key);
  };

  const settle = (order: T | null, phase: RampOrderPhase) => {
    stop();
    onSettled(order, phase);
  };

  async function tick() {
    if (stopped || requestInFlight) return;
    if (!isAwake()) return; // paused; onActivityChange resumes us on focus
    if (attempt >= maxAttempts) return settle(null, "unknown");
    attempt++;

    requestInFlight = true;
    const requestController = new AbortController();
    controller = requestController;
    let shouldReschedule = false;

    try {
      const res = await fetch(`/api/chainrails/ramp/orders/${key}`, {
        cache: "no-store",
        signal: requestController.signal,
      });
      if (!stopped) {
        if (!res.ok) {
          shouldReschedule = true;
        } else {
          const order = (await res.json()) as T | null;
          if (!stopped) {
            if (!order) {
              shouldReschedule = true;
            } else {
              onUpdate(order);

              const phase = classifyRampStatus(order.status);
              if (isRampPhaseTerminal(phase)) settle(order, phase);
              else shouldReschedule = true;
            }
          }
        }
      }
    } catch {
      // Aborted by stop(), or a transient network error — try again later.
      shouldReschedule = !stopped;
    } finally {
      requestInFlight = false;
      if (controller === requestController) controller = null;
    }

    if (shouldReschedule) schedule();
  }

  function onActivityChange() {
    if (stopped) return;
    if (isAwake()) {
      if (timer === null && !requestInFlight) void tick();
    } else if (timer !== null) {
      clearTimeout(timer); // left the tab — hold until we're back
      timer = null;
    }
  }

  const handle: RampPollHandle = { stop };
  active.set(key, handle);
  document.addEventListener("visibilitychange", onActivityChange);
  window.addEventListener("focus", onActivityChange);
  window.addEventListener("blur", onActivityChange);
  void tick(); // first poll immediately
  return handle;
}
