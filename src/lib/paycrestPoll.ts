"use client";

/**
 * Shared client-side poller for a single Paycrest order.
 *
 * Replaces the ad-hoc setInterval / for-loop pollers the on-ramp and off-ramp
 * hooks used to run. One loop per order id, so opening the same order on two
 * screens can't double-poll. It backs off after the first few ticks, pauses
 * entirely while the tab is hidden, and stops the moment the order reaches a
 * terminal state or hits the attempt cap.
 */

import {
  classifyPaycrestOrder,
  type PaycrestDirection,
  type PaycrestOrder,
} from "@/rails/paycrest";

export type PaycrestPollOutcome = "success" | "failed" | "expired" | "timeout";

export interface PaycrestPollOptions {
  direction: PaycrestDirection;
  /** Fresh order snapshot on every successful poll. */
  onUpdate: (order: PaycrestOrder) => void;
  /** Fires once when the loop stops, with the final order if we have one. */
  onSettled: (order: PaycrestOrder | null, outcome: PaycrestPollOutcome) => void;
  /**
   * Hard backstop on the number of polls (default 120). Terminal states and a
   * closed funding window normally stop the loop well before this is reached.
   */
  maxAttempts?: number;
}

export interface PaycrestPollHandle {
  stop: () => void;
}

const BASE_INTERVAL_MS = 5_000;
const MAX_INTERVAL_MS = 30_000;
const STEADY_TICKS = 3; // poll at 5s this many times, then start backing off

/** One live poller per order id. */
const active = new Map<string, PaycrestPollHandle>();

export function pollPaycrestOrder(
  orderId: string,
  { direction, onUpdate, onSettled, maxAttempts = 120 }: PaycrestPollOptions
): PaycrestPollHandle {
  const running = active.get(orderId);
  if (running) return running;

  let attempt = 0;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;

  // Awake = the tab is visible AND the window has focus. `document.hidden`
  // alone misses the common case where the browser stays on screen but the
  // user switches to another app (their banking app, an editor) — there the
  // tab is still "visible", so we lean on focus too.
  const isAwake = () =>
    !document.hidden && (document.hasFocus?.() ?? true);

  // 5s, 5s, 5s, 10s, 20s, 30s, 30s… — quick at first, calm once it drags on.
  const nextDelay = () =>
    attempt <= STEADY_TICKS
      ? BASE_INTERVAL_MS
      : Math.min(BASE_INTERVAL_MS * 2 ** (attempt - STEADY_TICKS), MAX_INTERVAL_MS);

  const schedule = () => {
    if (!stopped) timer = setTimeout(tick, nextDelay());
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timer) clearTimeout(timer);
    controller?.abort();
    document.removeEventListener("visibilitychange", onActivityChange);
    window.removeEventListener("focus", onActivityChange);
    window.removeEventListener("blur", onActivityChange);
    active.delete(orderId);
  };

  const settle = (
    order: PaycrestOrder | null,
    outcome: PaycrestPollOutcome
  ) => {
    stop();
    onSettled(order, outcome);
  };

  async function tick() {
    timer = null;
    if (stopped) return;
    if (!isAwake()) return; // paused; onActivityChange resumes us on focus
    if (attempt >= maxAttempts) return settle(null, "timeout");
    attempt++;

    controller = new AbortController();
    try {
      const res = await fetch(`/api/paycrest/order/${orderId}`, {
        signal: controller.signal,
      });
      if (stopped) return;
      if (!res.ok) return schedule();

      const order = (await res.json()) as PaycrestOrder;
      if (stopped) return;
      onUpdate(order);

      const outcome = classifyPaycrestOrder(order, direction);
      if (outcome === "pending") return schedule();
      settle(order, outcome);
    } catch {
      // Aborted by stop(), or a transient network error — try again later.
      if (!stopped) schedule();
    }
  }

  function onActivityChange() {
    if (stopped) return;
    if (isAwake()) {
      // Back on the tab — poll now and resume the cadence.
      if (!timer) void tick();
    } else if (timer) {
      // Left the tab/app — stop the pending poll until we're back.
      clearTimeout(timer);
      timer = null;
    }
  }

  const handle: PaycrestPollHandle = { stop };
  active.set(orderId, handle);
  document.addEventListener("visibilitychange", onActivityChange);
  window.addEventListener("focus", onActivityChange);
  window.addEventListener("blur", onActivityChange);
  void tick(); // first poll immediately
  return handle;
}
