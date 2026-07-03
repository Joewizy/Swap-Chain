import { useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  StyleSheet,
  type ViewProps,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { theme } from "@/theme";

export interface PickerOption {
  value: string;
  label: string;
  sublabel?: string;
  icon?: ViewProps["children"];
}

// Dropdown → bottom-sheet, matching the website's select. Optional search for
// long lists (e.g. banks).
export function Picker({
  value,
  options,
  onChange,
  title,
  placeholder = "Select",
  searchable = false,
}: {
  value?: string;
  options: PickerOption[];
  onChange: (value: string) => void;
  title: string;
  placeholder?: string;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = options.find((o) => o.value === value);
  const filtered =
    searchable && q.trim()
      ? options.filter((o) =>
          o.label.toLowerCase().includes(q.trim().toLowerCase())
        )
      : options;

  const close = () => {
    setOpen(false);
    setQ("");
  };

  return (
    <>
      <Pressable
        style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}
        onPress={() => setOpen(true)}
      >
        {selected?.icon}
        <Text style={selected ? styles.triggerText : styles.triggerPlaceholder}>
          {selected?.label ?? placeholder}
        </Text>
        <Feather name="chevron-down" size={18} color={theme.colors.muted} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={close}
      >
        <Pressable style={styles.backdrop} onPress={close} />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <Text style={styles.sheetTitle}>{title}</Text>
          {searchable && (
            <TextInput
              style={styles.search}
              value={q}
              onChangeText={setQ}
              placeholder="Search…"
              placeholderTextColor={theme.colors.faint}
              autoFocus
            />
          )}
          <ScrollView
            style={styles.list}
            keyboardShouldPersistTaps="handled"
          >
            {filtered.map((o) => {
              const active = o.value === value;
              return (
                <Pressable
                  key={o.value}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && styles.rowPressed,
                  ]}
                  onPress={() => {
                    onChange(o.value);
                    close();
                  }}
                >
                  {o.icon}
                  <View style={styles.rowMain}>
                    <Text style={styles.rowLabel}>{o.label}</Text>
                    {o.sublabel && (
                      <Text style={styles.rowSub}>{o.sublabel}</Text>
                    )}
                  </View>
                  {active && (
                    <Feather name="check" size={18} color={theme.colors.accent} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing(1.25),
    paddingHorizontal: theme.spacing(1.75),
    paddingVertical: theme.spacing(1.5),
    borderRadius: theme.radius.input,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  pressed: { opacity: 0.85 },
  triggerText: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "500",
  },
  triggerPlaceholder: { flex: 1, color: theme.colors.faint, fontSize: 16 },

  backdrop: { flex: 1, backgroundColor: "rgba(20,18,14,0.35)" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "72%",
    backgroundColor: theme.colors.bg,
    borderTopLeftRadius: theme.radius.cardLg,
    borderTopRightRadius: theme.radius.cardLg,
    paddingHorizontal: theme.spacing(2.5),
    paddingTop: theme.spacing(1.5),
    paddingBottom: theme.spacing(4),
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border2,
    marginBottom: theme.spacing(1.5),
  },
  sheetTitle: {
    color: theme.colors.text,
    fontFamily: theme.serif,
    fontSize: 24,
    marginBottom: theme.spacing(1.5),
  },
  search: {
    color: theme.colors.text,
    fontSize: 16,
    borderRadius: theme.radius.input,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing(1.75),
    paddingVertical: theme.spacing(1.25),
    marginBottom: theme.spacing(1),
  },
  list: { flexGrow: 0 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing(1.5),
    paddingVertical: theme.spacing(1.5),
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  rowPressed: { backgroundColor: theme.colors.bgSoft },
  rowMain: { flex: 1, gap: 2 },
  rowLabel: { color: theme.colors.text, fontSize: 16 },
  rowSub: { color: theme.colors.muted, fontSize: 13 },
});
