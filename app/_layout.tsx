// app/_layout.tsx
import "react-native-gesture-handler";
import "react-native-reanimated";

import React, { useEffect, useMemo, useRef } from "react";
import { SplashScreen, Slot } from "expo-router"; // re-exports expo-splash-screen
import "./globals.css";
import { useFonts } from "expo-font";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as Sentry from "@sentry/react-native";
import useAuthStore from "@/store/auth.store";
import { Provider as PaperProvider } from "react-native-paper";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { SafeAreaProvider } from "react-native-safe-area-context";

// --- Sentry ---
Sentry.init({
  dsn: "https://bd80887b4574dfa5981f2915c67f9052@o4509852474540032.ingest.us.sentry.io/4509852502917120",
  sendDefaultPii: true,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],
});

// Silence a noisy Expo Router deprecation warning
const _origWarn = console.warn;
console.warn = (...args: any[]) => {
  if (typeof args[0] === "string" && args[0].includes("This route is deprecated")) return;
  _origWarn(...args);
};

// 💡 Keep the native splash visible until we purposely hide it.
void SplashScreen.preventAutoHideAsync();

// Optional: brand delay so splash is visible briefly even on fast devices
const MIN_SPLASH_MS = 1200;

export default Sentry.wrap(function RootLayout() {
  const { isLoading, fetchAuthenticatedUser } = useAuthStore();

  const [fontsLoaded, error] = useFonts({
    "Quicksand-Bold": require("../assets/fonts/Quicksand-Bold.ttf"),
    "Quicksand-Medium": require("../assets/fonts/Quicksand-Medium.ttf"),
    "Quicksand-Regular": require("../assets/fonts/Quicksand-Regular.ttf"),
    "Quicksand-SemiBold": require("../assets/fonts/Quicksand-SemiBold.ttf"),
    "Quicksand-Light": require("../assets/fonts/Quicksand-Light.ttf"),
  });

  // start auth bootstrap once on mount
  useEffect(() => {
    fetchAuthenticatedUser();
  }, [fetchAuthenticatedUser]);

  // track when we mounted to enforce the minimum splash time
  const mountedAtRef = useRef<number>(Date.now());

  // hide native splash once: fonts loaded + auth done + min time elapsed
  const ready = useMemo(() => fontsLoaded && !isLoading, [fontsLoaded, isLoading]);

  useEffect(() => {
    if (error) throw error;

    if (ready) {
      const elapsed = Date.now() - mountedAtRef.current;
      const remaining = Math.max(0, MIN_SPLASH_MS - elapsed);

      const timer = setTimeout(() => {
        // Hide the native splash — UI will render immediately after because we stop returning null
        SplashScreen.hideAsync().catch(() => {});
      }, remaining);

      return () => clearTimeout(timer);
    }
  }, [ready, error]);

  // While not ready, return null — native splash stays visible because we prevented auto-hide.
  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PaperProvider>
          <BottomSheetModalProvider>
            {/* Zustand needs no provider. Just render your routes. */}
            <Slot />
          </BottomSheetModalProvider>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
});
