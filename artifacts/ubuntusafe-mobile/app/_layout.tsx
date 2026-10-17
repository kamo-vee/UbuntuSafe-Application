import React, { useEffect } from "react";
import { Alert, Pressable, StatusBar, Text, View } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { AppProvider } from "@/context/AppContext";
import { setAuthTokenGetter } from "@/lib/api";
import * as SecureStore from "expo-secure-store";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { syncNow } from "@/lib/sync";
import { useApp } from "@/context/AppContext";

const queryClient = new QueryClient();
function SyncOnReconnect() {
  const { isOnline } = useNetworkStatus();
  useEffect(() => {
    if (isOnline) void syncNow().catch(() => undefined);
  }, [isOnline]);
  return null;
}
function ThemedNavigation() {
  const router = useRouter();
  const {
    colors,
    isDark,
    locked,
    biometricAvailable,
    biometricSignIn,
    usePasswordInstead,
  } = useApp();
  const [unlocking, setUnlocking] = React.useState(false);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
      {locked && (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: colors.background,
            justifyContent: "center",
            padding: 28,
            gap: 16,
          }}
        >
          <Text style={{ color: colors.primary, fontWeight: "800", letterSpacing: 2 }}>
            UBUNTUSAFE
          </Text>
          <Text style={{ color: colors.foreground, fontSize: 30, fontWeight: "800" }}>
            App locked
          </Text>
          <Text style={{ color: colors.mutedForeground, lineHeight: 22 }}>
            Verify with your device biometrics to continue.
          </Text>
          {biometricAvailable && (
            <Pressable
              disabled={unlocking}
              onPress={async () => {
                setUnlocking(true);
                try {
                  if (!(await biometricSignIn()))
                    Alert.alert("Not verified", "Try again or use your password.");
                } catch (error) {
                  Alert.alert(
                    "Could not unlock",
                    error instanceof Error ? error.message : "Try again or use your password.",
                  );
                } finally {
                  setUnlocking(false);
                }
              }}
              style={{
                minHeight: 54,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.primary,
              }}
            >
              <Text style={{ color: colors.primaryForeground, fontWeight: "800" }}>
                {unlocking ? "Verifying..." : "Unlock with biometrics"}
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => {
              usePasswordInstead();
              router.replace("/sign-in");
            }}
            style={{ minHeight: 48, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: colors.primary, fontWeight: "700" }}>
              Continue with password
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
export default function RootLayout() {
  useEffect(() => {
    setAuthTokenGetter(() => SecureStore.getItemAsync("ubuntusafe.auth.token"));
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <SyncOnReconnect />
        <ThemedNavigation />
      </AppProvider>
    </QueryClientProvider>
  );
}
