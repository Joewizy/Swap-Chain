import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRecipients } from "@/store/recipients";
import { Intro, PageTitle } from "@/components/form";
import { theme } from "@/theme";

// Saved recipients — device-local address book. Entries also appear after a
// completed cash-out; the manual add keeps it exercisable.
export function RecipientsScreen() {
  const { recipients, hydrated, hydrate, upsert, remove } = useRecipients();
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrated, hydrate]);

  const hasRecipients = recipients.length > 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <PageTitle>Recipients</PageTitle>
      <Intro>Banks, mobile money and wallets you pay out to.</Intro>

      {hasRecipients && !adding && (
        <View style={styles.listHeader}>
          <Text style={styles.count}>
            {recipients.length} saved
          </Text>
          <Pressable
            style={({ pressed }) => [styles.addPill, pressed && styles.pressed]}
            onPress={() => setAdding(true)}
          >
            <Feather name="plus" size={15} color={theme.colors.accent} />
            <Text style={styles.addPillText}>Add</Text>
          </Pressable>
        </View>
      )}

      {adding && (
        <AddRecipientForm
          onCancel={() => setAdding(false)}
          onSave={async (r) => {
            await upsert(r);
            setAdding(false);
          }}
        />
      )}

      {!hasRecipients && !adding && (
        <EmptyState onAdd={() => setAdding(true)} />
      )}

      {recipients.map((r) => (
        <View key={r.id} style={styles.card}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(r.name || r.institutionName)}</Text>
          </View>
          <View style={styles.cardMain}>
            <Text style={styles.name} numberOfLines={1}>
              {r.name || r.institutionName}
            </Text>
            <Text style={styles.detail} numberOfLines={1}>
              {r.institutionName} · {r.accountIdentifier}
            </Text>
            <Text style={styles.currencyTag}>{r.currency}</Text>
          </View>
          <Pressable
            onPress={() => void remove(r.id)}
            hitSlop={10}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Feather name="trash-2" size={18} color={theme.colors.muted} />
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Feather name="users" size={26} color={theme.colors.accent} />
      </View>
      <Text style={styles.emptyTitle}>No recipients yet</Text>
      <Text style={styles.emptyBody}>
        Save a bank, mobile money, or wallet to reuse it next time. Recipients
        are also added automatically after a sale.
      </Text>
      <Pressable
        style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
        onPress={onAdd}
      >
        <Feather name="plus" size={16} color={theme.colors.btnFg} />
        <Text style={styles.primaryText}>Add recipient</Text>
      </Pressable>
    </View>
  );
}

/** First letters of the first two words — the address-book monogram. */
function initials(source: string): string {
  const parts = source.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

function AddRecipientForm({
  onSave,
  onCancel,
}: {
  onCancel: () => void;
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

  const canSave = provider.trim() && account.trim() && currency.trim();

  return (
    <View style={styles.form}>
      <View style={styles.formHeader}>
        <Text style={styles.formTitle}>New recipient</Text>
        <Pressable onPress={onCancel} hitSlop={10}>
          <Feather name="x" size={20} color={theme.colors.muted} />
        </Pressable>
      </View>
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
        style={[styles.primary, !canSave && styles.primaryDisabled]}
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
        <Text style={styles.primaryText}>Save recipient</Text>
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
  content: { padding: theme.spacing(2.5), gap: theme.spacing(1.75) },
  pressed: { opacity: 0.7 },

  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: theme.spacing(0.5),
  },
  count: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  addPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: theme.spacing(1.5),
    paddingVertical: theme.spacing(0.85),
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.accentLine,
    backgroundColor: theme.colors.accentSoft,
  },
  addPillText: { color: theme.colors.accent, fontSize: 14, fontWeight: "600" },

  // Empty state
  empty: {
    alignItems: "center",
    paddingVertical: theme.spacing(4),
    paddingHorizontal: theme.spacing(2),
    gap: theme.spacing(1),
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.accentSoft,
    borderWidth: 1,
    borderColor: theme.colors.accentLine,
    marginBottom: theme.spacing(0.5),
  },
  emptyTitle: {
    color: theme.colors.text,
    fontFamily: theme.serif,
    fontSize: 22,
  },
  emptyBody: {
    color: theme.colors.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    maxWidth: 300,
    marginBottom: theme.spacing(1),
  },

  // Recipient card
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing(1.5),
    padding: theme.spacing(2),
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.accentSoft,
  },
  avatarText: {
    color: theme.colors.accent,
    fontSize: 16,
    fontWeight: "700",
  },
  cardMain: { flex: 1, gap: 3 },
  name: { color: theme.colors.text, fontSize: 16, fontWeight: "600" },
  detail: { color: theme.colors.muted, fontSize: 13 },
  currencyTag: {
    alignSelf: "flex-start",
    marginTop: 2,
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.bgSoft,
    overflow: "hidden",
  },

  // Add form
  form: {
    padding: theme.spacing(2.25),
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing(1.5),
    ...theme.shadow,
  },
  formHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  formTitle: {
    color: theme.colors.text,
    fontFamily: theme.serif,
    fontSize: 20,
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

  // Primary action (shared: empty state + save)
  primary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    alignSelf: "stretch",
    backgroundColor: theme.colors.btnBg,
    borderRadius: theme.radius.input,
    minHeight: 52,
    paddingHorizontal: theme.spacing(3),
  },
  primaryDisabled: { opacity: 0.4 },
  primaryText: { color: theme.colors.btnFg, fontSize: 15, fontWeight: "600" },
});
