import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  NavigationContainer,
  DarkTheme,
  type Theme,
} from "@react-navigation/native";
import { RootNavigator } from "@/navigation/RootNavigator";
import { queryClient } from "@/lib/queryClient";
import { theme } from "@/theme";

const navTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: theme.colors.bg,
    card: theme.colors.surface,
    text: theme.colors.text,
    border: theme.colors.border,
    primary: theme.colors.accent,
  },
};

/**
 * Root: providers wrap the tab shell. Order matches the system map in
 * todo/MOBILE_ARCHITECTURE.md §3 — server-state cache (TanStack Query) and
 * navigation. The wallet provider (Reown AppKit) slots in here in Phase 0's
 * wallet step, above the navigator.
 */
export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <NavigationContainer theme={navTheme}>
          <StatusBar style="light" />
          <RootNavigator />
        </NavigationContainer>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
