import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  type ViewProps,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import type { RootTabParamList } from "@/navigation/RootNavigator";
import { useWalletAuth } from "@/wallet/useWalletAuth";
import { useSession } from "@/store/session";
import { useAuth } from "@/store/auth";
import { fetchOrders, type HistoryOrder } from "@/api/history";
import { getOrder } from "@/api/paycrest";
import {
  classifyPaycrestOrder,
  type PaycrestOrder,
} from "@/rails/paycrest";
import { walletReady } from "@/wallet/config";
import { PageTitle } from "@/components/form";
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
  const [selected, setSelected] = useState<HistoryOrder | null>(null);
  const navigation = useNavigation<NavigationProp<RootTabParamList>>();
  const setResumeOrder = useSession((s) => s.setResumeOrder);

  // Still-open orders reopen in their flow screen so the user can finish them;
  // finished ones just show a read-only detail sheet.
  const openOrder = (o: HistoryOrder) => {
    if (isResumable(o.status)) {
      setResumeOrder({
        id: o.id,
        direction: o.direction,
        token: o.token,
        network: o.network,
      });
      navigation.navigate(o.direction === "offramp" ? "Sell" : "Buy");
    } else {
      setSelected(o);
    }
  };

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
      <PageTitle>History</PageTitle>
      <View style={styles.headerRow}>
        <Text style={styles.muted}>
          {sessionAddress
            ? `Signed in as ${sessionAddress.slice(0, 6)}…${sessionAddress.slice(-4)}`
            : ""}
        </Text>
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
        <OrderRow key={o.id} order={o} onPress={() => openOrder(o)} />
      ))}

      <OrderDetailModal order={selected} onClose={() => setSelected(null)} />
    </ScrollView>
  );
}

// Finished orders have nothing left to do — everything else can be reopened in
// its flow screen to finish paying / funding.
const TERMINAL_STATUSES = ["settled", "fulfilled", "refunded", "expired"];
function isResumable(status: string): boolean {
  return !TERMINAL_STATUSES.includes(status.toLowerCase());
}

function OrderRow({
  order,
  onPress,
}: {
  order: HistoryOrder;
  onPress: () => void;
}) {
  const verb = order.direction === "offramp" ? "Sell" : "Buy";
  const fiat =
    order.fiatAmount != null && order.currency
      ? `${order.fiatAmount.toLocaleString()} ${order.currency}`
      : null;
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle}>
          {verb} · {order.amount} {order.token}
        </Text>
        <View style={styles.cardTopRight}>
          <Text style={styles.status}>{order.status}</Text>
          <Feather name="chevron-right" size={16} color={theme.colors.faint} />
        </View>
      </View>
      <Text style={styles.muted}>
        {[order.network, fiat, order.recipientName, order.institution]
          .filter(Boolean)
          .join(" · ")}
      </Text>
    </Pressable>
  );
}

// Tap-through detail: fetches the full order so pending/initiated/expired ones
// are viewable — for a still-open Buy it shows the deposit instructions to pay.
function OrderDetailModal({
  order,
  onClose,
}: {
  order: HistoryOrder | null;
  onClose: () => void;
}) {
  const detail = useQuery({
    queryKey: ["order", order?.id],
    queryFn: () => getOrder(order!.id),
    enabled: !!order,
  });
  const verb = order?.direction === "offramp" ? "Sell" : "Buy";

  return (
    <Modal
      visible={!!order}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.grabber} />
        {order && (
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>
              {verb} · {order.amount} {order.token}
            </Text>
            <Text style={styles.status}>{order.status}</Text>
          </View>
        )}

        {detail.isLoading && (
          <ActivityIndicator color={theme.colors.accent} style={styles.pad} />
        )}
        {detail.isError && (
          <Text style={styles.error}>Couldn&apos;t load this order.</Text>
        )}
        {detail.data && (
          <ScrollView contentContainerStyle={styles.detailBody}>
            <OrderDetailBody order={detail.data} />
          </ScrollView>
        )}

        <Pressable style={styles.button} onPress={onClose}>
          <Text style={styles.buttonText}>Close</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function OrderDetailBody({ order }: { order: PaycrestOrder }) {
  const isOnramp = order.direction === "onramp";
  const outcome = classifyPaycrestOrder(order, order.direction);
  // A Buy that hasn't settled/failed still has payable deposit instructions.
  const showDeposit =
    isOnramp &&
    outcome === "pending" &&
    !!order.depositAccountIdentifier &&
    !!order.amountToTransfer;

  return (
    <>
      <View style={styles.card}>
        {order.rate && (
          <DetailRow l="Rate" r={`${order.rate} ${order.currency ?? ""}`.trim()} />
        )}
        {order.currency && <DetailRow l="Currency" r={order.currency} />}
        {order.createdAt && (
          <DetailRow
            l="Created"
            r={new Date(order.createdAt).toLocaleString()}
          />
        )}
      </View>

      {showDeposit && (
        <View style={styles.depositCard}>
          <Text style={styles.depositTitle}>Send your payment</Text>
          <Text style={styles.muted2}>
            Transfer exactly this amount to finish this order (long-press to
            copy).
          </Text>
          <DetailRow
            l="Amount"
            r={`${order.amountToTransfer} ${order.depositCurrency ?? ""}`.trim()}
            copyable
          />
          <DetailRow
            l="Account"
            r={order.depositAccountIdentifier ?? ""}
            copyable
          />
          {order.depositAccountName && (
            <DetailRow l="Name" r={order.depositAccountName} copyable />
          )}
          {order.depositInstitution && (
            <DetailRow l="Bank" r={order.depositInstitution} copyable />
          )}
        </View>
      )}

      {order.receiveAddress && (
        <View style={styles.addrBlock}>
          <Text style={styles.addrLabel}>Deposit address</Text>
          <Text style={styles.addrText} selectable>
            {order.receiveAddress}
          </Text>
        </View>
      )}
      {order.recipientAddress && (
        <View style={styles.addrBlock}>
          <Text style={styles.addrLabel}>Recipient wallet</Text>
          <Text style={styles.addrText} selectable>
            {order.recipientAddress}
          </Text>
        </View>
      )}
      {order.txHash && (
        <View style={styles.addrBlock}>
          <Text style={styles.addrLabel}>Transaction</Text>
          <Text style={styles.addrText} selectable>
            {order.txHash}
          </Text>
        </View>
      )}
    </>
  );
}

function DetailRow({
  l,
  r,
  copyable,
}: {
  l: string;
  r: string;
  copyable?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{l}</Text>
      <Text style={styles.detailValue} selectable={copyable}>
        {r}
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
  content: { padding: theme.spacing(2.5), gap: theme.spacing(1.75) },
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
    padding: theme.spacing(2.25),
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing(0.75),
    ...theme.shadow,
  },
  cardPressed: { opacity: 0.7 },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTopRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing(0.75),
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
    minHeight: 54,
    justifyContent: "center",
    paddingHorizontal: theme.spacing(3),
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: theme.colors.btnFg, fontSize: 15, fontWeight: "600" },

  // Order detail bottom-sheet
  backdrop: { flex: 1, backgroundColor: "rgba(20,18,14,0.35)" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "82%",
    backgroundColor: theme.colors.bg,
    borderTopLeftRadius: theme.radius.cardLg,
    borderTopRightRadius: theme.radius.cardLg,
    paddingHorizontal: theme.spacing(2.5),
    paddingTop: theme.spacing(1.5),
    paddingBottom: theme.spacing(4),
    gap: theme.spacing(1.5),
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border2,
    marginBottom: theme.spacing(0.5),
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetTitle: {
    color: theme.colors.text,
    fontFamily: theme.serif,
    fontSize: 24,
  },
  detailBody: { gap: theme.spacing(1.5) },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing(1.5),
  },
  detailLabel: { color: theme.colors.muted, fontSize: 14 },
  detailValue: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "600",
    flexShrink: 1,
    textAlign: "right",
  },
  muted2: { color: theme.colors.muted, fontSize: 13, lineHeight: 19 },
  depositCard: {
    padding: theme.spacing(2.25),
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.accentLine,
    gap: theme.spacing(1),
    ...theme.shadow,
  },
  depositTitle: { color: theme.colors.text, fontSize: 16, fontWeight: "700" },
  addrBlock: {
    padding: theme.spacing(1.75),
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing(0.5),
  },
  addrLabel: {
    color: theme.colors.muted,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  addrText: { color: theme.colors.text, fontSize: 14, lineHeight: 21 },
});
