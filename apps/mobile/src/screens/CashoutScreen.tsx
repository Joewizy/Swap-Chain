import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useSession } from "@/store/session";
import { theme } from "@/theme";
import { Placeholder } from "@/components/Placeholder";

/**
 * Off-ramp — the Phase-2 money path (Paycrest order → sign → status).
 *
 * In Phase 1 it has no signing yet; it renders whatever `FlowLaunch` the intent
 * chat handed off, so the chat → flow pipeline is verifiable end to end. The
 * guided quote/confirm/execute UI replaces this in Phase 2.
 */
export function CashoutScreen() {
  const launch = useSession((s) => s.pendingLaunch);

  if (!launch) {
    return (
      <Placeholder
        title="Cash out"
        subtitle="Ask on the first tab (e.g. “Cash out 200 USDC to GTBank”) and the parsed request lands here. Signing arrives in Phase 2."
      />
    );
  }

  const seedRows: [string, string | undefined][] = [
    ["Flow", launch.flow],
    ["Token", launch.token ?? launch.fromToken],
    ["Amount", launch.amount],
    ["Chain", launch.chain],
    ["Currency", launch.currency],
    ["Recipient", launch.recipientHint],
    ["Provider", launch.institutionHint],
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.title}>Handoff received</Text>
      <Text style={styles.subtitle}>
        Parsed from your request — Phase 2 turns this into a signed cash-out.
      </Text>

      {launch.chatSummary && (
        <View style={styles.quoteCard}>
          <Text style={styles.quoteText}>“{launch.chatSummary}”</Text>
        </View>
      )}

      <View style={styles.card}>
        {seedRows
          .filter(([, v]) => v)
          .map(([label, value]) => (
            <View key={label} style={styles.row}>
              <Text style={styles.rowLabel}>{label}</Text>
              <Text style={styles.rowValue}>{value}</Text>
            </View>
          ))}
      </View>

      {launch.plan && launch.plan.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.rowLabel}>Plan</Text>
          {launch.plan.map((step, i) => (
            <Text key={i} style={styles.planStep}>
              {i + 1}. {step}
            </Text>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(2), gap: theme.spacing(1.5) },
  title: { color: theme.colors.text, fontSize: 22, fontWeight: "700" },
  subtitle: { color: theme.colors.muted, fontSize: 14, lineHeight: 20 },
  quoteCard: {
    padding: theme.spacing(1.5),
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  quoteText: { color: theme.colors.text, fontSize: 15, fontStyle: "italic" },
  card: {
    padding: theme.spacing(2),
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing(1),
  },
  row: { flexDirection: "row", justifyContent: "space-between" },
  rowLabel: { color: theme.colors.muted, fontSize: 14 },
  rowValue: { color: theme.colors.text, fontSize: 14, fontWeight: "600" },
  planStep: { color: theme.colors.text, fontSize: 14, lineHeight: 20 },
});
