import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { IntentScreen } from "@/screens/IntentScreen";
import { CashoutScreen } from "@/screens/CashoutScreen";
import { BuyScreen } from "@/screens/BuyScreen";
import { HistoryScreen } from "@/screens/HistoryScreen";
import { RecipientsScreen } from "@/screens/RecipientsScreen";
import { theme } from "@/theme";

// No nav header — each screen owns its title, so the tab name isn't repeated
// above the content. Wrap in a top safe-area so content clears the notch.
// (Written as concrete components, not an HOC — a generic ComponentType return
// trips the monorepo's duplicate @types/react.)
const safeArea = { flex: 1, backgroundColor: theme.colors.bg } as const;

const AskTab = () => (
  <SafeAreaView style={safeArea} edges={["top"]}>
    <IntentScreen />
  </SafeAreaView>
);
const CashoutTab = () => (
  <SafeAreaView style={safeArea} edges={["top"]}>
    <CashoutScreen />
  </SafeAreaView>
);
const BuyTab = () => (
  <SafeAreaView style={safeArea} edges={["top"]}>
    <BuyScreen />
  </SafeAreaView>
);
const HistoryTab = () => (
  <SafeAreaView style={safeArea} edges={["top"]}>
    <HistoryScreen />
  </SafeAreaView>
);
const RecipientsTab = () => (
  <SafeAreaView style={safeArea} edges={["top"]}>
    <RecipientsScreen />
  </SafeAreaView>
);

// Bottom-tab shell — one tab per core job.
export type RootTabParamList = {
  Ask: undefined;
  Sell: undefined;
  Buy: undefined;
  History: undefined;
  Recipients: undefined;
};

const ICONS: Record<keyof RootTabParamList, keyof typeof Feather.glyphMap> = {
  Ask: "message-circle",
  Sell: "arrow-down-circle",
  Buy: "credit-card",
  History: "clock",
  Recipients: "users",
};

const Tab = createBottomTabNavigator<RootTabParamList>();

export function RootNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        sceneStyle: { backgroundColor: theme.colors.bg },
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          height: 88,
          paddingTop: 8,
        },
        tabBarItemStyle: { paddingTop: 2 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600", marginTop: 2 },
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.faint,
        tabBarIcon: ({ color, focused }) => (
          <Feather
            name={ICONS[route.name]}
            size={22}
            color={color}
            style={{ opacity: focused ? 1 : 0.9 }}
          />
        ),
      })}
    >
      <Tab.Screen name="Ask" component={AskTab} />
      <Tab.Screen name="Sell" component={CashoutTab} />
      <Tab.Screen name="Buy" component={BuyTab} />
      <Tab.Screen name="History" component={HistoryTab} />
      <Tab.Screen name="Recipients" component={RecipientsTab} />
    </Tab.Navigator>
  );
}
