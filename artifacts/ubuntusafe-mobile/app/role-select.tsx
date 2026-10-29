import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { goBackOrReplace } from "@/lib/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { useApp } from "@/context/AppContext";

export default function RoleSelectScreen() {
  const router = useRouter();
  const { colors } = useApp();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <BrandLogo iconSize={58} textSize={24} />
      <Text style={[styles.title, { color: colors.foreground }]}>Choose your access</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        Continue as a user or sign in to the protected administrator area.
      </Text>
      <Pressable style={[styles.button, { backgroundColor: colors.primary }]} onPress={() => router.push("/user-access")}>
        <Text style={{ color: colors.primaryForeground, fontWeight: "800" }}>User</Text>
      </Pressable>
      <Pressable style={[styles.button, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]} onPress={() => router.push("/admin-sign-in")}>
        <Text style={{ color: colors.foreground, fontWeight: "800" }}>Admin</Text>
      </Pressable>
      <Pressable onPress={() => goBackOrReplace(router, "/")}><Text style={{ color: colors.primary, textAlign: "center" }}>Back</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 28, justifyContent: "center", gap: 16 },
  title: { fontSize: 30, fontWeight: "800", marginTop: 28 },
  subtitle: { fontSize: 15, lineHeight: 22, marginBottom: 12 },
  button: { minHeight: 56, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});
