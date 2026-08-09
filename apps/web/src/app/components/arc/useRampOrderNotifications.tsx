"use client";

import { useEffect, useRef } from "react";
import toast from "react-hot-toast";
import {
  classifyRampStatus,
  isRampPhaseTerminal,
  type RampOrderPhase,
} from "@/rails/chainrails";
import {
  loadNotifiedRampIds,
  loadTrackedRampOrders,
  markRampNotified,
  type TrackedRampOrder,
} from "./chainrailsOrders";

/**
 * The ChainRails twin of useOrderNotifications: on load, checks the ramp orders
 * this device created and toasts any that finished while the user was away —
 * with a "View" button that reopens the order. Reads status live by id (no
 * sign-in). Only recent, not-yet-notified orders are considered, so old history
 * never spams a toast.
 */
const RECENT_MS = 24 * 60 * 60 * 1000;

export function useRampOrderNotifications(
  onView: (order: TrackedRampOrder) => void
): void {
  const onViewRef = useRef(onView);
  onViewRef.current = onView;
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // once per mount — avoid duplicate toasts
    ran.current = true;

    const notified = loadNotifiedRampIds();
    const now = Date.now();
    const candidates = loadTrackedRampOrders().filter(
      (o) => !notified.has(o.id) && now - o.createdAt < RECENT_MS
    );
    if (!candidates.length) return;

    let cancelled = false;
    (async () => {
      for (const order of candidates) {
        if (cancelled) return;
        let phase: RampOrderPhase;
        try {
          const res = await fetch(`/api/chainrails/ramp/orders/${order.id}`, {
            cache: "no-store",
          });
          if (!res.ok) continue; // transient — try again next load
          const data = (await res.json()) as { status?: string } | null;
          phase = classifyRampStatus(data?.status);
        } catch {
          continue;
        }
        if (!isRampPhaseTerminal(phase)) continue; // still in flight

        markRampNotified(order.id);
        if (!cancelled) showToast(order, phase);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  function showToast(order: TrackedRampOrder, phase: RampOrderPhase) {
    const isBuy = order.direction === "onramp";
    const title =
      phase === "completed"
        ? isBuy
          ? "Buy complete"
          : "Payout complete"
        : phase === "expired"
          ? "Order expired"
          : "Order couldn't complete";
    const detail =
      phase === "completed"
        ? isBuy
          ? `Received ${order.cryptoLabel}`
          : `${order.fiatLabel ?? order.cryptoLabel} paid out`
        : `${order.cryptoLabel}${order.fiatLabel ? ` · ${order.fiatLabel}` : ""}`;
    const icon = phase === "completed" ? "✅" : "⚠️";

    toast(
      (t) => (
        <span className="row center gap-3">
          <span className="col" style={{ lineHeight: 1.3 }}>
            <strong style={{ fontSize: 13 }}>{title}</strong>
            <span style={{ fontSize: 12, color: "var(--fg-soft)" }}>
              {detail}
            </span>
          </span>
          <button
            className="btn btn-sm"
            style={{ whiteSpace: "nowrap" }}
            onClick={() => {
              onViewRef.current(order);
              toast.dismiss(t.id);
            }}
          >
            View
          </button>
        </span>
      ),
      { duration: 10000, icon }
    );
  }
}
