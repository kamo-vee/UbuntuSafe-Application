import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { BrandLogo } from "@/components/BrandLogo";
import { useApp } from "@/context/AppContext";

export default function UserAccessScreen() {
  const router = useRouter();
  const { colors } = useApp();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <BrandLogo iconSize={54} textSize={23} />
      <Text style={[styles.title, { color: colors.foreground }]}>Welcome to UbuntuSafe</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Sign in to your account or create one to get protected.</Text>
      <Pressable style={[styles.button, { backgroundColor: colors.primary }]} onPress={() => router.push("/sign-in")}>
        <Text style={{ color: colors.primaryForeground, fontWeight: "800" }}>Sign in</Text>
      </Pressable>
      <Pressable style={[styles.button, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]} onPress={() => router.push("/create-account")}>
        <Text style={{ color: colors.foreground, fontWeight: "800" }}>Create account</Text>
      </Pressable>
      <Pressable onPress={() => router.back()}><Text style={{ color: colors.primary, textAlign: "center" }}>Back</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 28, justifyContent: "center", gap: 16 },
  title: { fontSize: 28, fontWeight: "800", marginTop: 26 },
  subtitle: { fontSize: 15, lineHeight: 22, marginBottom: 12 },
  button: { minHeight: 56, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});
