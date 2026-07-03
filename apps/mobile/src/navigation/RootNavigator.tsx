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

const Tab = createBottomTabNavigator<RootTabParamList>();

export function RootNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.bg },
        headerTitleStyle: {
          color: theme.colors.text,
          fontFamily: theme.serif,
          fontSize: 26,
        },
        headerTitleAlign: "left",
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: theme.colors.bg },
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.faint,
      }}
    >
      <Tab.Screen name="Ask" component={IntentScreen} />
      <Tab.Screen name="Cash out" component={CashoutScreen} />
      <Tab.Screen name="Buy" component={BuyScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Recipients" component={RecipientsScreen} />
    </Tab.Navigator>
  );
}
