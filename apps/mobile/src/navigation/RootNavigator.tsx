import { Feather } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { IntentScreen } from "@/screens/IntentScreen";
import { CashoutScreen } from "@/screens/CashoutScreen";
import { BuyScreen } from "@/screens/BuyScreen";
import { HistoryScreen } from "@/screens/HistoryScreen";
import { RecipientsScreen } from "@/screens/RecipientsScreen";
import { theme } from "@/theme";

// Bottom-tab shell — one tab per core job.
export type RootTabParamList = {
  Ask: undefined;
  "Cash out": undefined;
  Buy: undefined;
  History: undefined;
  Recipients: undefined;
};

const ICONS: Record<keyof RootTabParamList, keyof typeof Feather.glyphMap> = {
  Ask: "message-circle",
  "Cash out": "arrow-down-circle",
  Buy: "credit-card",
  History: "clock",
  Recipients: "users",
};

const Tab = createBottomTabNavigator<RootTabParamList>();

export function RootNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: theme.colors.bg },
        headerTitleStyle: {
          color: theme.colors.text,
          fontFamily: theme.serif,
          fontSize: 28,
        },
        headerTitleAlign: "left",
        headerShadowVisible: false,
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
      <Tab.Screen name="Ask" component={IntentScreen} />
      <Tab.Screen name="Cash out" component={CashoutScreen} />
      <Tab.Screen name="Buy" component={BuyScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Recipients" component={RecipientsScreen} />
    </Tab.Navigator>
  );
}
