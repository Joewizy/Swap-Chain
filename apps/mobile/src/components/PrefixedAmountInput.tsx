import { View, Text, TextInput, StyleSheet } from "react-native";
import { theme } from "@/theme";
import { formStyles as f } from "./form";

type Props = {
  amount: string;
  onChange: (value: string) => void;
  /** e.g. "₦" for NGN, "$" for stables. Hidden when empty. */
  prefix?: string;
  placeholder?: string;
  error?: boolean;
};

/** Amount field with a leading currency symbol — value stays digits-only. */
export function PrefixedAmountInput({
  amount,
  onChange,
  prefix,
  placeholder = "0.00",
  error,
}: Props) {
  return (
    <View style={[f.input, styles.shell, error && styles.shellError]}>
      {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
      <TextInput
        style={styles.input}
        value={amount}
        onChangeText={(t) => {
          const v = t.replace(/[^0-9.]/g, "");
          if ((v.match(/\./g) || []).length > 1) return;
          onChange(v);
        }}
        keyboardType="decimal-pad"
        placeholder={placeholder}
        placeholderTextColor={theme.colors.muted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 0,
  },
  shellError: { borderColor: theme.colors.err },
  prefix: {
    color: theme.colors.muted,
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 22,
  },
  input: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 16,
    paddingVertical: theme.spacing(1.5),
    paddingHorizontal: 0,
  },
});
