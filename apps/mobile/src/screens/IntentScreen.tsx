import { useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type {
  ChatMessage,
  ChatReply,
  FlowId,
} from "@railglide/shared/assistant/types";
import { sendChat } from "@/api/chat";
import { ApiError } from "@/api/client";
import { useSession } from "@/store/session";
import { theme } from "@/theme";
import type { RootTabParamList } from "@/navigation/RootNavigator";

/** CTA label per ready flow — mirrors the web AssistantChat. */
const FLOW_CTA: Record<FlowId, string> = {
  cashout: "Continue to cash out",
  buy: "Buy crypto",
  bridge: "Open swap",
};

const SUGGESTIONS = [
  "Cash out 200 USDC to GTBank",
  "Sell my USDT on Polygon",
  "Swap ETH to USDC on Base",
];

/**
 * Home — natural-language intent chat (Phase 1). Posts the running thread to
 * /api/chat and, when the reply is `ready`, stashes the FlowLaunch in the
 * session store and hands off to the matching flow screen. No signing here.
 */
export function IntentScreen() {
  const navigation =
    useNavigation<BottomTabNavigationProp<RootTabParamList>>();
  const setPendingLaunch = useSession((s) => s.setPendingLaunch);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastReply, setLastReply] = useState<ChatReply | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || thinking) return;

    const next: ChatMessage[] = [
      ...messages,
      { role: "user", content: trimmed },
    ];
    setMessages(next);
    setInput("");
    setError(null);
    setLastReply(null);
    setThinking(true);

    try {
      const reply = await sendChat(next);
      setMessages([...next, { role: "assistant", content: reply.message }]);
      setLastReply(reply);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't reach the assistant — check your connection."
      );
    } finally {
      setThinking(false);
    }
  };

  const startOver = () => {
    setMessages([]);
    setLastReply(null);
    setError(null);
    setInput("");
  };

  const handoff = () => {
    if (!lastReply?.launch) return;
    const firstUser = messages.find((m) => m.role === "user")?.content;
    setPendingLaunch({
      ...lastReply.launch,
      plan: lastReply.plan.length ? lastReply.plan : lastReply.launch.plan,
      chatSummary: firstUser,
    });
    // Route to the screen for the ready flow. Bridge/Swap isn't built yet, so
    // it falls back to Cash out until that screen lands.
    const tab: Record<FlowId, keyof RootTabParamList> = {
      cashout: "Cash out",
      buy: "Buy",
      bridge: "Cash out",
    };
    navigation.navigate(tab[lastReply.launch.flow]);
  };

  const empty = messages.length === 0 && !thinking;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <View style={styles.flex}>
        {messages.length > 0 && (
          <Pressable style={styles.startOver} onPress={startOver}>
            <Text style={styles.startOverText}>Start over</Text>
          </Pressable>
        )}

        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          onContentSizeChange={() =>
            scrollRef.current?.scrollToEnd({ animated: true })
          }
          keyboardShouldPersistTaps="handled"
        >
          {empty && (
            <View style={styles.hintCard}>
              <Text style={styles.hintTitle}>Try saying</Text>
              {SUGGESTIONS.map((s) => (
                <Pressable key={s} onPress={() => void send(s)}>
                  <Text style={styles.suggestion}>&ldquo;{s}&rdquo;</Text>
                </Pressable>
              ))}
            </View>
          )}

          {messages.map((m, i) => (
            <View
              key={i}
              style={[
                styles.bubble,
                m.role === "user" ? styles.userBubble : styles.assistantBubble,
              ]}
            >
              <Text
                style={m.role === "user" ? styles.userText : styles.assistantText}
              >
                {m.content}
              </Text>
            </View>
          ))}

          {thinking && (
            <View style={styles.thinkingRow}>
              <ActivityIndicator size="small" color={theme.colors.muted} />
              <Text style={styles.thinkingText}>Thinking…</Text>
            </View>
          )}

          {error && (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {lastReply?.launch && (
            <View style={styles.handoffCard}>
              {lastReply.plan.length > 0 && (
                <View style={styles.planList}>
                  {lastReply.plan.map((step, i) => (
                    <Text key={i} style={styles.planStep}>
                      {i + 1}. {step}
                    </Text>
                  ))}
                </View>
              )}
              <Pressable style={styles.ctaButton} onPress={handoff}>
                <Text style={styles.ctaText}>
                  {FLOW_CTA[lastReply.launch.flow]} →
                </Text>
              </Pressable>
            </View>
          )}
        </ScrollView>

        <View style={styles.inputBar}>
          <TextInput
            style={styles.textInput}
            value={input}
            onChangeText={setInput}
            placeholder="Describe what you want to do…"
            placeholderTextColor={theme.colors.muted}
            editable={!thinking}
            multiline
            onSubmitEditing={() => void send(input)}
            returnKeyType="send"
          />
          <Pressable
            style={[
              styles.sendButton,
              (!input.trim() || thinking) && styles.sendButtonDisabled,
            ]}
            onPress={() => void send(input)}
            disabled={!input.trim() || thinking}
          >
            <Text style={styles.sendButtonText}>→</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.bg },
  startOver: { alignSelf: "flex-end", padding: theme.spacing(1.5) },
  startOverText: { color: theme.colors.muted, fontSize: 13 },
  scrollContent: { padding: theme.spacing(2), gap: theme.spacing(1.5) },
  hintCard: {
    padding: theme.spacing(2),
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing(1),
  },
  hintTitle: { color: theme.colors.accent, fontSize: 13, fontWeight: "600" },
  suggestion: { color: theme.colors.muted, fontSize: 14, lineHeight: 22 },
  bubble: {
    maxWidth: "88%",
    padding: theme.spacing(1.5),
    borderRadius: 14,
  },
  userBubble: { alignSelf: "flex-end", backgroundColor: theme.colors.accent },
  assistantBubble: {
    alignSelf: "flex-start",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  userText: { color: "#FFFFFF", fontSize: 15, lineHeight: 21 },
  assistantText: { color: theme.colors.text, fontSize: 15, lineHeight: 21 },
  thinkingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing(1),
    padding: theme.spacing(1),
  },
  thinkingText: { color: theme.colors.muted, fontSize: 13 },
  errorCard: {
    padding: theme.spacing(1.5),
    borderRadius: 12,
    backgroundColor: "#2A1416",
    borderWidth: 1,
    borderColor: "#F87171",
  },
  errorText: { color: "#F87171", fontSize: 13 },
  handoffCard: {
    padding: theme.spacing(2),
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surface,
    gap: theme.spacing(1.5),
  },
  planList: { gap: theme.spacing(0.5) },
  planStep: { color: theme.colors.muted, fontSize: 13, lineHeight: 20 },
  ctaButton: {
    backgroundColor: theme.colors.accent,
    borderRadius: 10,
    padding: theme.spacing(1.5),
    alignItems: "center",
  },
  ctaText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: theme.spacing(1),
    padding: theme.spacing(1.5),
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  textInput: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 15,
    maxHeight: 120,
    paddingVertical: theme.spacing(1),
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: { opacity: 0.4 },
  sendButtonText: { color: "#FFFFFF", fontSize: 18, fontWeight: "700" },
});
