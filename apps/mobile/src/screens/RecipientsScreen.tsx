import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";
import { useRecipients } from "@/store/recipients";
import { theme } from "@/theme";

/**
 * Saved recipients — a device-local address book (banks, mobile-money
 * providers). Entries normally appear after a completed cash-out (Phase 2);
 * the manual add here keeps the screen exercisable in Phase 1.
 */
export function RecipientsScreen() {
  const { recipients, hydrated, hydrate, upsert, remove } = useRecipients();
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrated, hydrate]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Recipients</Text>
        <Pressable
          style={styles.addButton}
          onPress={() => setAdding((v) => !v)}
        >
          <Text style={styles.addButtonText}>{adding ? "Close" : "+ Add"}</Text>
        </Pressable>
      </View>

      {adding && (
        <AddRecipientForm
          onSave={async (r) => {
            await upsert(r);
            setAdding(false);
          }}
        />
      )}

      {recipients.length === 0 && !adding && (
        <Text style={styles.empty}>
          No saved recipients yet. They&apos;re added after a cash-out, or tap
          “+ Add”.
        </Text>
      )}

      {recipients.map((r) => (
        <View key={r.id} style={styles.card}>
          <View style={styles.cardMain}>
            <Text style={styles.name}>{r.name}</Text>
            <Text style={styles.detail}>
              {r.institutionName} · {r.accountIdentifier} · {r.currency}
            </Text>
          </View>
          <Pressable onPress={() => void remove(r.id)} hitSlop={8}>
            <Text style={styles.remove}>Remove</Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

function AddRecipientForm({
  onSave,
}: {
  onSave: (r: {
    name: string;
    currency: string;
    institution: string;
    institutionName: string;
    accountIdentifier: string;
    accountName: string;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("");
  const [account, setAccount] = useState("");
  const [currency, setCurrency] = useState("");

  const canSave =
    provider.trim() && account.trim() && currency.trim();

  return (
    <View style={styles.form}>
      <FormField label="Account name" value={name} onChange={setName} />
      <FormField
        label="Provider (bank / mobile money)"
        value={provider}
        onChange={setProvider}
      />
      <FormField
        label="Account number"
        value={account}
        onChange={setAccount}
        keyboardType="number-pad"
      />
      <FormField
        label="Currency (e.g. NGN)"
        value={currency}
        onChange={setCurrency}
        autoCapitalize="characters"
      />
      <Pressable
        style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
        disabled={!canSave}
        onPress={() =>
          onSave({
            name: name.trim(),
            currency: currency.trim(),
            institution: provider.trim().toLowerCase().replace(/\s+/g, ""),
            institutionName: provider.trim(),
            accountIdentifier: account.trim(),
            accountName: name.trim(),
          })
        }
      >
        <Text style={styles.saveButtonText}>Save recipient</Text>
      </Pressable>
    </View>
  );
}

function FormField({
  label,
  value,
  onChange,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  keyboardType?: "number-pad";
  autoCapitalize?: "characters";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.fieldInput}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        placeholderTextColor={theme.colors.muted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(2), gap: theme.spacing(1.5) },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { color: theme.colors.text, fontSize: 22, fontWeight: "700" },
  addButton: {
    paddingHorizontal: theme.spacing(1.5),
    paddingVertical: theme.spacing(0.75),
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  addButtonText: { color: theme.colors.accent, fontSize: 14, fontWeight: "600" },
  empty: {
    color: theme.colors.muted,
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: theme.spacing(2),
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: theme.spacing(2),
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardMain: { flex: 1, gap: theme.spacing(0.5) },
  name: { color: theme.colors.text, fontSize: 16, fontWeight: "600" },
  detail: { color: theme.colors.muted, fontSize: 13 },
  remove: { color: "#F87171", fontSize: 13, fontWeight: "600" },
  form: {
    padding: theme.spacing(2),
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing(1.5),
  },
  field: { gap: theme.spacing(0.5) },
  fieldLabel: { color: theme.colors.muted, fontSize: 13 },
  fieldInput: {
    color: theme.colors.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingHorizontal: theme.spacing(1.5),
    paddingVertical: theme.spacing(1),
  },
  saveButton: {
    backgroundColor: theme.colors.accent,
    borderRadius: 10,
    padding: theme.spacing(1.5),
    alignItems: "center",
  },
  saveButtonDisabled: { opacity: 0.4 },
  saveButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
});
