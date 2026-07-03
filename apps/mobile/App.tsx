import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { AppKit } from "@reown/appkit-wagmi-react-native";
import {
  NavigationContainer,
  DarkTheme,
  type Theme,
} from "@react-navigation/native";
import { RootNavigator } from "@/navigation/RootNavigator";
import { queryClient } from "@/lib/queryClient";
import { wagmiConfig } from "@/wallet/config";
import { useAuth } from "@/store/auth";
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
 * Root: providers wrap the tab shell. Wallet transport (wagmi + Reown AppKit)
 * is outermost so wallet state is available everywhere; TanStack Query sits
 * inside it (AppKit and wagmi share the query client). `<AppKit />` renders the
 * connect modal once. On launch we rehydrate any stored SIWE session.
 */
export default function App() {
  useEffect(() => {
    void useAuth.getState().hydrate();
  }, []);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <NavigationContainer theme={navTheme}>
            <StatusBar style="light" />
            <RootNavigator />
          </NavigationContainer>
          <AppKit />
        </SafeAreaProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
