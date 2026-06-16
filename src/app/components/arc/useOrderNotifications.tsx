"use client";

import { useEffect, useRef } from "react";
import toast from "react-hot-toast";
import {
  classifyPaycrestOrder,
  type PaycrestOrder,
} from "@/rails/paycrest";
import {
  buildHistoryOrder,
  getPendingTrackedOrders,
  markTrackedNotified,
  pruneTrackedOrders,
  untrackOrder,
  type TrackedOrder,
} from "@/lib/orderNotifications";
import type { Order } from "./AppScreens";

/**
 * On load, checks the orders this device created (tracked in localStorage) and
 * toasts any that finished while the user was away — with a "View" button that
 * reopens the exact order. Status is read by order id, so no wallet/sign-in is
 * needed; cross-device review still lives in History.
 */
export function useOrderNotifications(onView: (order: Order) => void): void {
  const onViewRef = useRef(onView);
  onViewRef.current = onView;
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // once per mount — avoid duplicate toasts on re-render
    ran.current = true;

    pruneTrackedOrders();
    const pending = getPendingTrackedOrders();
    if (!pending.length) return;

    let cancelled = false;
    (async () => {
      for (const tracked of pending) {
        if (cancelled) return;
        let order: PaycrestOrder;
        try {
          const res = await fetch(`/api/paycrest/order/${tracked.id}`);
          if (res.status === 404) {
            untrackOrder(tracked.id); // gone upstream — stop tracking
            continue;
          }
          if (!res.ok) continue; // transient — try again next load
          order = (await res.json()) as PaycrestOrder;
        } catch {
          continue;
        }

        const outcome = classifyPaycrestOrder(order, tracked.direction);
        if (outcome === "pending") continue; // still in flight

        markTrackedNotified(tracked.id);
        if (!cancelled) showCompletionToast(tracked, order, outcome);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  function showCompletionToast(
    tracked: TrackedOrder,
    order: PaycrestOrder,
    outcome: "success" | "failed" | "expired"
  ) {
    const isBuy = tracked.direction === "onramp";
    const amount = `${order.amount} ${tracked.token}`;
    const title =
      outcome === "success"
        ? isBuy
          ? "Buy complete"
          : "Cashout complete"
        : outcome === "expired"
          ? "Order expired"
          : "Order refunded";
    const detail =
      outcome === "success"
        ? isBuy
          ? `Received ${amount}`
          : order.currency
            ? `${amount} → ${order.currency}`
            : amount
        : `${amount}${order.currency ? ` · ${order.currency}` : ""}`;
    const icon = outcome === "success" ? "✅" : "⚠️";

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
              onViewRef.current(buildHistoryOrder(tracked, order));
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
