import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  type ViewProps,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useWalletAuth } from "@/wallet/useWalletAuth";
import { useAuth } from "@/store/auth";
import { fetchOrders, type HistoryOrder } from "@/api/history";
import { walletReady } from "@/wallet/config";
import { theme } from "@/theme";

// Order history — gated behind a SIWE session: connect, sign in (gasless), then
// the authenticated wallet's Paycrest orders load.
export function HistoryScreen() {
  const {
    isConnected,
    authStatus,
    signingIn,
    error,
    connect,
    signIn,
    signOut,
    sessionAddress,
  } = useWalletAuth();
  const token = useAuth((s) => s.token);

  const ordersQuery = useQuery({
    queryKey: ["orders", token],
    queryFn: () => fetchOrders(token as string),
    enabled: authStatus === "signed-in" && !!token,
  });

  if (!walletReady) {
    return (
      <Centered>
        <Text style={styles.title}>History</Text>
        <Text style={styles.muted}>
          Set EXPO_PUBLIC_REOWN_PROJECT_ID in apps/mobile/.env to enable wallet
          connect.
        </Text>
      </Centered>
    );
  }

  if (authStatus === "loading") {
    return (
      <Centered>
        <ActivityIndicator color={theme.colors.accent} />
      </Centered>
    );
  }

  if (authStatus !== "signed-in") {
    return (
      <Centered>
        <Text style={styles.title}>Sign in to see your orders</Text>
        <Text style={styles.muted}>
          Your history is tied to your wallet. Connect and sign a message (free,
          no transaction) to load it.
        </Text>
        {!isConnected ? (
          <PrimaryButton label="Connect wallet" onPress={connect} />
        ) : (
          <PrimaryButton
            label={signingIn ? "Check your wallet…" : "Sign in"}
            onPress={() => void signIn()}
            disabled={signingIn}
          />
        )}
        {error && <Text style={styles.error}>{error}</Text>}
      </Centered>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>History</Text>
          {sessionAddress && (
            <Text style={styles.muted}>
              {sessionAddress.slice(0, 6)}…{sessionAddress.slice(-4)}
            </Text>
          )}
        </View>
        <Pressable onPress={() => void signOut()} hitSlop={8}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>

      {ordersQuery.isLoading && (
        <ActivityIndicator color={theme.colors.accent} style={styles.pad} />
      )}

      {ordersQuery.isError && (
        <Text style={styles.error}>
          Couldn&apos;t load orders. Pull to retry.
        </Text>
      )}

      {ordersQuery.data?.orders.length === 0 && (
        <Text style={styles.muted}>No orders yet.</Text>
      )}

      {ordersQuery.data?.orders.map((o) => (
        <OrderRow key={o.id} order={o} />
      ))}
    </ScrollView>
  );
}

function OrderRow({ order }: { order: HistoryOrder }) {
  const verb = order.direction === "offramp" ? "Cash out" : "Buy";
  const fiat =
    order.fiatAmount != null && order.currency
      ? `${order.fiatAmount.toLocaleString()} ${order.currency}`
      : null;
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle}>
          {verb} · {order.amount} {order.token}
        </Text>
        <Text style={styles.status}>{order.status}</Text>
      </View>
      <Text style={styles.muted}>
        {[order.network, fiat, order.recipientName, order.institution]
          .filter(Boolean)
          .join(" · ")}
      </Text>
    </View>
  );
}

// Pull the children type from View itself so it matches whichever @types/react
// react-native resolves (web pins 18, mobile 19 — a bare ReactNode annotation
// picks the wrong one and errors on the bigint member).
function Centered({ children }: { children: ViewProps["children"] }) {
  return <View style={styles.centered}>{children}</View>;
}

function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[styles.button, disabled && styles.buttonDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(2), gap: theme.spacing(1.5) },
  centered: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing(3),
    gap: theme.spacing(1.5),
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  title: { color: theme.colors.text, fontSize: 30, fontFamily: theme.serif },
  muted: {
    color: theme.colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  error: { color: theme.colors.err, fontSize: 13, textAlign: "center" },
  signOut: { color: theme.colors.muted, fontSize: 13, fontWeight: "600" },
  pad: { paddingVertical: theme.spacing(2) },
  card: {
    padding: theme.spacing(2),
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing(0.5),
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: { color: theme.colors.text, fontSize: 15, fontWeight: "600" },
  status: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  button: {
    backgroundColor: theme.colors.btnBg,
    borderRadius: theme.radius.input,
    paddingVertical: theme.spacing(1.5),
    paddingHorizontal: theme.spacing(3),
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: theme.colors.btnFg, fontSize: 15, fontWeight: "600" },
});
