// Shared poller for a single ChainRails ramp order — the mobile twin of the
// web chainrailsPoll. Polls immediately, holds 5s for the first few ticks, then
// backs off toward 30s, PAUSES while the app is backgrounded (the whole time
// the user is paying in the Safari checkout), fires instantly on return to the
// app, and stops the moment the order reaches a terminal state.
import { AppState, type AppStateStatus } from "react-native";
import {
  classifyRampStatus,
  isRampPhaseTerminal,
  type RampOrderPhase,
} from "@/rails/chainrails";
import { getRampOrder, type RampOrder } from "@/api/chainrails";

const BASE_INTERVAL_MS = 5_000;
const MAX_INTERVAL_MS = 30_000;
const STEADY_TICKS = 3; // poll at 5s this many times, then start backing off

export interface RampPollHandle {
  stop: () => void;
}

export function pollRampOrder(
  orderId: string | number,
  {
    onUpdate,
    onSettled,
    maxAttempts = 120,
  }: {
    onUpdate: (order: RampOrder) => void;
    onSettled: (order: RampOrder | null, phase: RampOrderPhase) => void;
    maxAttempts?: number;
  }
): RampPollHandle {
  let attempt = 0;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const isAwake = () => AppState.currentState === "active";

  // 5s, 5s, 5s, 10s, 20s, 30s, 30s… — quick at first, calm once it drags on.
  const nextDelay = () =>
    attempt <= STEADY_TICKS
      ? BASE_INTERVAL_MS
      : Math.min(
          BASE_INTERVAL_MS * 2 ** (attempt - STEADY_TICKS),
          MAX_INTERVAL_MS
        );

  const schedule = () => {
    if (!stopped) timer = setTimeout(tick, nextDelay());
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timer) clearTimeout(timer);
    sub.remove();
  };

  const settle = (order: RampOrder | null, phase: RampOrderPhase) => {
    stop();
    onSettled(order, phase);
  };

  async function tick() {
    timer = null;
    if (stopped) return;
    if (!isAwake()) return; // paused; onStateChange resumes us on foreground
    if (attempt >= maxAttempts) return settle(null, "unknown");
    attempt++;

    try {
      const data = await getRampOrder(orderId);
      if (stopped) return;
      onUpdate(data);
      const phase = classifyRampStatus(data.status);
      if (isRampPhaseTerminal(phase)) return settle(data, phase);
      schedule();
    } catch {
      // Transient — retry on the next tick.
      if (!stopped) schedule();
    }
  }

  function onStateChange(state: AppStateStatus) {
    if (stopped) return;
    if (state === "active") {
      if (!timer) void tick(); // back in the app — poll now, resume cadence
    } else if (timer) {
      clearTimeout(timer); // backgrounded — hold until we're back
      timer = null;
    }
  }

  const sub = AppState.addEventListener("change", onStateChange);
  void tick(); // first poll immediately
  return { stop };
}
