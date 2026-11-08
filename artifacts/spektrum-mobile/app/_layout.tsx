import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { View, Text } from "react-native";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/contexts/AuthContext";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { firebaseInitError } from "@/lib/firebase";
import { PushRuntime } from "@/components/PushRuntime";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="auth" options={{ presentation: "modal", headerShown: false }} />
      <Stack.Screen name="story/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="read/[storyId]" options={{ headerShown: false }} />
      <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="user/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="story-manage/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="reading-stats/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="book-import" options={{ headerShown: false }} />
      <Stack.Screen name="chapter-editor/[storyId]" options={{ headerShown: false }} />
      <Stack.Screen name="jetonlar" options={{ headerShown: false }} />
      <Stack.Screen name="moderator" options={{ headerShown: false }} />
      <Stack.Screen name="push-settings" options={{ headerShown: false }} />
      <Stack.Screen name="ask/[uid]" options={{ headerShown: false }} />
      <Stack.Screen name="qa/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="kvkk" options={{ headerShown: false }} />
      <Stack.Screen name="terms" options={{ headerShown: false }} />
      <Stack.Screen name="odeme" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  if (firebaseInitError) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: "#0B0D14", justifyContent: "center", alignItems: "center", padding: 24 }}>
          <Text style={{ color: "#A07FE6", fontSize: 18, fontWeight: "700", marginBottom: 12 }}>
            Firebase Bağlatı Hatası
          </Text>
          <Text style={{ color: "#a1a1aa", fontSize: 13, textAlign: "center" }}>
            {firebaseInitError}
          </Text>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <LocaleProvider>
              <AuthProvider>
                <PushRuntime />
                <RootLayoutNav />
              </AuthProvider>
            </LocaleProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
