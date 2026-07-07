import {
  View,
  Text,
  Pressable,
  StyleSheet,
  type ViewProps,
} from "react-native";
import { theme } from "@/theme";

// The screen's single serif title. The nav header is hidden, so each screen
// renders this once at the top instead of repeating the tab name in a bar.
export function PageTitle({ children }: { children: string }) {
  return <Text style={formStyles.pageTitle}>{children}</Text>;
}

// One-line screen description under the title, matching the website.
export function Intro({ children }: { children: string }) {
  return <Text style={formStyles.intro}>{children}</Text>;
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ViewProps["children"];
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

export function Segmented({
  options,
  value,
  labels,
  onChange,
}: {
  options: string[];
  value: string;
  labels?: string[];
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o, i) => (
        <Pressable
          key={o}
          style={[styles.segment, value === o && styles.segmentActive]}
          onPress={() => onChange(o)}
        >
          <Text
            style={[styles.segmentText, value === o && styles.segmentTextActive]}
          >
            {labels ? labels[i] : o}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Row({ l, r }: { l: string; r: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{l}</Text>
      <Text style={styles.rowValue}>{r}</Text>
    </View>
  );
}

export function Primary({
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
      style={({ pressed }) => [
        styles.primary,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

export function Secondary({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
      onPress={onPress}
    >
      <Text style={styles.secondaryText}>{label}</Text>
    </Pressable>
  );
}

export const formStyles = StyleSheet.create({
  input: {
    color: theme.colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.input,
    paddingHorizontal: theme.spacing(1.75),
    paddingVertical: theme.spacing(1.5),
    backgroundColor: theme.colors.surface,
  },
  card: {
    padding: theme.spacing(2.25),
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing(1.25),
    ...theme.shadow,
  },
  estimate: { color: theme.colors.muted, fontSize: 13, lineHeight: 20 },
  pageTitle: {
    color: theme.colors.text,
    fontSize: 34,
    fontFamily: theme.serif,
    marginBottom: theme.spacing(0.25),
  },
  intro: {
    color: theme.colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: theme.spacing(0.5),
  },
  error: { color: theme.colors.err, fontSize: 13, lineHeight: 18 },
  title: { color: theme.colors.text, fontSize: 32, fontFamily: theme.serif },
  rowButtons: {
    flexDirection: "row",
    gap: theme.spacing(1.25),
    marginTop: theme.spacing(0.5),
  },
});

const styles = StyleSheet.create({
  field: { gap: theme.spacing(1) },
  fieldLabel: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
  segmented: { flexDirection: "row", gap: theme.spacing(1), flexWrap: "wrap" },
  segment: {
    paddingVertical: theme.spacing(1),
    paddingHorizontal: theme.spacing(1.75),
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  segmentActive: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accent,
  },
  segmentText: { color: theme.colors.muted, fontSize: 14, fontWeight: "600" },
  segmentTextActive: { color: theme.colors.accentFg },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: theme.spacing(2),
  },
  rowLabel: { color: theme.colors.muted, fontSize: 14 },
  rowValue: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "600",
    flexShrink: 1,
    textAlign: "right",
  },
  primary: {
    backgroundColor: theme.colors.btnBg,
    borderRadius: theme.radius.input,
    minHeight: 54,
    paddingHorizontal: theme.spacing(2),
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  primaryText: {
    color: theme.colors.btnFg,
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.35 },
  secondary: {
    borderRadius: theme.radius.input,
    minHeight: 54,
    paddingHorizontal: theme.spacing(2),
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.border2,
    flex: 1,
  },
  secondaryText: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
});
