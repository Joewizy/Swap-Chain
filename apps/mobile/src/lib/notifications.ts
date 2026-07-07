import { Platform } from "react-native";

type NotificationsApi = {
  setNotificationHandler(handler: unknown): void;
  getPermissionsAsync(): Promise<{ granted: boolean; canAskAgain: boolean }>;
  requestPermissionsAsync(): Promise<{ granted: boolean }>;
  scheduleNotificationAsync(request: {
    content: { title: string; body: string; sound?: boolean };
    trigger: null;
  }): Promise<string>;
  setNotificationChannelAsync(
    channelId: string,
    channel: Record<string, unknown>
  ): Promise<unknown>;
  AndroidImportance: { DEFAULT: number };
};

let Notifications: NotificationsApi | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Notifications = require("expo-notifications") as NotificationsApi;
} catch {
  Notifications = null;
}

// Show the banner even when the app is foregrounded — completion often happens
// while the status screen is open, and a banner reads better than nothing.
Notifications?.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let channelReady = false;

/**
 * Ask for notification permission if we don't already have it. Returns true when
 * we're allowed to post. Safe to call repeatedly — it won't re-prompt once the
 * user has answered.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!Notifications) return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const asked = await Notifications.requestPermissionsAsync();
    return asked.granted;
  } catch {
    return false;
  }
}

async function ensureAndroidChannel(): Promise<void> {
  if (!Notifications || channelReady || Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync("orders", {
      name: "Order updates",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
    channelReady = true;
  } catch {
    // Non-fatal — the notification still posts on the default channel.
  }
}

export interface OrderCompleteDetail {
  kind: "buy" | "sell";
  /** Crypto amount for a buy, fiat amount for a sell. */
  amount?: string;
  token?: string;
  currency?: string;
  chainName?: string;
}

/** Fire a "your order completed" notification. No-op if permission is denied. */
export async function notifyOrderComplete(
  detail: OrderCompleteDetail
): Promise<void> {
  if (!Notifications) return;
  if (!(await ensureNotificationPermission())) return;
  await ensureAndroidChannel();

  const title = detail.kind === "buy" ? "Buy complete" : "Sale complete";

  let body: string;
  if (detail.kind === "buy") {
    const received = [detail.amount, detail.token].filter(Boolean).join(" ");
    body = received
      ? `You received ${received}${detail.chainName ? ` on ${detail.chainName}` : ""}.`
      : "Your purchase is complete.";
  } else {
    const payout = [detail.amount, detail.currency].filter(Boolean).join(" ");
    body = payout
      ? `${payout} is on the way to your recipient.`
      : "Your payout is on the way to your recipient.";
  }

  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: null,
    });
  } catch {
    // Swallow — a missing notification should never break the order flow.
  }
}
