import { View, Text, StyleSheet } from "react-native";
import { theme } from "@/theme";

/**
 * Scaffold placeholder for a not-yet-built screen. Each Phase-0 tab renders one
 * so the shell, navigation, and providers can be verified before the real
 * flows land in Phase 1+.
 */
export function Placeholder({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing(3),
    gap: theme.spacing(1),
  },
  title: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: "700",
  },
  subtitle: {
    color: theme.colors.muted,
    fontSize: 14,
    textAlign: "center",
  },
});
