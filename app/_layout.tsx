import {
    DarkTheme,
    DefaultTheme,
    ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { dbReady } from "@/services/database";
import { createTables } from "@/services/database/schema";
import { seedDummyData } from "@/services/database/seed";

// Keep the splash screen visible while fonts are loading
SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  // On mobile dbReady resolves instantly; on web it waits for sql.js WASM.
  const [dbInitialized, setDbInitialized] = useState(false);

  useEffect(() => {
    dbReady
      .then(() => {
        // ── Database initialisation (runs once, after DB is ready) ──────
        // Wrapped in its own try/catch so that a schema error does NOT
        // prevent setDbInitialized(true) from being called — the UI must
        // always unblock so the error is visible to the developer.
        try {
          createTables();
          if (__DEV__) {
            seedDummyData();
            // Stress test: uncomment ONCE, then comment out again.
            // seedStressData();
          }
        } catch (err) {
          console.error("[db] Schema init failed:", err);
        }
        setDbInitialized(true);
      })
      .catch((err: unknown) => {
        console.error("[db] WASM failed to load — web DB unavailable:", err);
        setDbInitialized(true);
      });
  }, []);

  const [fontsLoaded, fontError] = useFonts({
    // Bengali font — required for all বাকি খাতা text throughout the app
    NotoBengali: require("../assets/fonts/NotoSansBengali-subset.ttf"),
  });

  // Hide splash screen once fonts are ready (or if loading failed)
  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
      if (fontError) {
        console.warn("[fonts] Failed to load NotoBengali:", fontError);
      }
    }
  }, [fontsLoaded, fontError]);

  // Block render until both the DB and fonts are resolved
  if (!dbInitialized || (!fontsLoaded && !fontError)) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="customer-detail" options={{ headerShown: false }} />
        <Stack.Screen name="add-customer" options={{ headerShown: false }} />
        <Stack.Screen name="edit-customer" options={{ headerShown: false }} />
        <Stack.Screen name="baki-modal" options={{ headerShown: false }} />
        <Stack.Screen name="payment-modal" options={{ headerShown: false }} />
        <Stack.Screen name="sales" options={{ headerShown: false }} />
        <Stack.Screen name="record-sale" options={{ headerShown: false }} />
        <Stack.Screen name="inventory" options={{ headerShown: false }} />
        <Stack.Screen name="product-form" options={{ headerShown: false }} />
        <Stack.Screen name="stock-adjust" options={{ headerShown: false }} />
        <Stack.Screen name="suggestions" options={{ headerShown: false }} />
        {__DEV__ && (
          <Stack.Screen name="dev-db" options={{ headerShown: false }} />
        )}
        <Stack.Screen
          name="modal"
          options={{ presentation: "modal", title: "Modal" }}
        />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
