import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useApp } from "@/context/AppContext";

export default function TabsLayout() {
  const { isOnline } = useNetworkStatus();
  const { colors, t } = useApp();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {!isOnline && (
        <View style={[styles.banner, { backgroundColor: colors.secondary }]}>
          <Feather name="wifi-off" size={14} color={colors.primary} />
          <Text style={{ color: colors.secondaryForeground }}>
            {t("offline")} — scans and reports stay on this device.
          </Text>
        </View>
      )}
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.mutedForeground,
          tabBarStyle: {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
          },
          tabBarLabelStyle: { fontWeight: "700" },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t("dashboard"),
            tabBarIcon: ({ color }) => (
              <Feather name="home" size={19} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: t("settings"),
            tabBarIcon: ({ color }) => (
              <Feather name="settings" size={19} color={color} />
            ),
          }}
        />
      </Tabs>
    </View>
  );
}
const styles = StyleSheet.create({
  banner: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 8,
  },
});
