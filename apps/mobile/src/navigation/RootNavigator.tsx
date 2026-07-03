import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { IntentScreen } from "@/screens/IntentScreen";
import { CashoutScreen } from "@/screens/CashoutScreen";
import { BuyScreen } from "@/screens/BuyScreen";
import { HistoryScreen } from "@/screens/HistoryScreen";
import { RecipientsScreen } from "@/screens/RecipientsScreen";
import { theme } from "@/theme";

/**
 * Bottom-tab shell — one tab per core job, mirroring the web app's goals.
 */
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
        headerTitleStyle: { color: theme.colors.text },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: theme.colors.bg },
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.muted,
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
