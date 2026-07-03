import {
  View,
  Text,
  Pressable,
  StyleSheet,
  type ViewProps,
} from "react-native";
import { theme } from "@/theme";

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
      style={[styles.primary, disabled && styles.disabled]}
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
    <Pressable style={styles.secondary} onPress={onPress}>
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
    borderRadius: 10,
    paddingHorizontal: theme.spacing(1.5),
    paddingVertical: theme.spacing(1.25),
    backgroundColor: theme.colors.surface,
  },
  card: {
    padding: theme.spacing(2),
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing(1),
  },
  estimate: { color: theme.colors.muted, fontSize: 13, lineHeight: 19 },
  error: { color: theme.colors.err, fontSize: 13 },
  title: {
    color: theme.colors.text,
    fontSize: 30,
    fontFamily: theme.serif,
  },
  rowButtons: {
    flexDirection: "row",
    gap: theme.spacing(1),
    marginTop: theme.spacing(1),
  },
});

const styles = StyleSheet.create({
  field: { gap: theme.spacing(0.75) },
  fieldLabel: { color: theme.colors.muted, fontSize: 13 },
  segmented: { flexDirection: "row", gap: theme.spacing(0.75), flexWrap: "wrap" },
  segment: {
    paddingVertical: theme.spacing(1),
    paddingHorizontal: theme.spacing(1.5),
    borderRadius: 999,
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
    padding: theme.spacing(1.5),
    alignItems: "center",
    flex: 1,
  },
  primaryText: { color: theme.colors.btnFg, fontSize: 15, fontWeight: "600" },
  disabled: { opacity: 0.4 },
  secondary: {
    borderRadius: 10,
    padding: theme.spacing(1.5),
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
    flex: 1,
  },
  secondaryText: { color: theme.colors.text, fontSize: 15, fontWeight: "600" },
});
