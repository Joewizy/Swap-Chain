import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { AppKit } from "@reown/appkit-wagmi-react-native";
import {
  useFonts,
  InstrumentSerif_400Regular,
} from "@expo-google-fonts/instrument-serif";
import {
  NavigationContainer,
  DefaultTheme,
  type Theme,
} from "@react-navigation/native";
import { RootNavigator } from "@/navigation/RootNavigator";
import { queryClient } from "@/lib/queryClient";
import { wagmiConfig } from "@/wallet/config";
import { useAuth } from "@/store/auth";
import { theme } from "@/theme";

// Light navigation theme, matching the warm off-white website.
const navTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: theme.colors.bg,
    card: theme.colors.surface,
    text: theme.colors.text,
    border: theme.colors.border,
    primary: theme.colors.accent,
  },
};

// Root providers: wallet (wagmi) → Query → navigation, with <AppKit/> once.
// Loads the display font and rehydrates any stored SIWE session on launch.
export default function App() {
  const [fontsLoaded] = useFonts({ InstrumentSerif_400Regular });

  useEffect(() => {
    void useAuth.getState().hydrate();
  }, []);

  if (!fontsLoaded) return null;

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <NavigationContainer theme={navTheme}>
            <StatusBar style="dark" />
            <RootNavigator />
          </NavigationContainer>
          <AppKit />
        </SafeAreaProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
