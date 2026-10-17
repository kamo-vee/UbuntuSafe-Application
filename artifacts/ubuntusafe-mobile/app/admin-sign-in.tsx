import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useApp } from "@/context/AppContext";
import { apiRequest } from "@/lib/api";

export default function AdminSignInScreen() {
  const router = useRouter();
  const { colors, signIn, signOut } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    setError("");
    const normalizedEmail = email.trim();
    if (!normalizedEmail && !password) return setError("Enter the administrator email and password.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return setError("Enter a valid administrator email address.");
    if (!password) return setError("Enter a valid administrator password.");
    setBusy(true);
    try {
      await signIn(normalizedEmail, password);
      await apiRequest<{ authorized: boolean }>("/auth/admin-verify");
      router.replace("/admin-dashboard");
    } catch (cause) {
      await signOut().catch(() => undefined);
      setError(cause instanceof Error ? cause.message : "Administrator sign-in failed.");
    } finally { setBusy(false); }
  };
  return <View style={[styles.screen, { backgroundColor: colors.background }]}>
    <Text style={[styles.title, { color: colors.foreground }]}>Administrator sign in</Text>
    <Text style={{ color: colors.mutedForeground, lineHeight: 22 }}>Use an account whose email is authorized in the server’s COMMUNITY_REPORT_ADMIN_EMAILS setting.</Text>
    <TextInput accessibilityLabel="Administrator email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="Administrator email" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]} />
    <TextInput accessibilityLabel="Administrator password" value={password} onChangeText={setPassword} secureTextEntry placeholder="Password" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]} />
    {error ? <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{error}</Text> : null}
    <Pressable disabled={busy} onPress={() => void submit()} style={[styles.button, { backgroundColor: colors.primary }]}><Text style={{ color: colors.primaryForeground, fontWeight: "800" }}>{busy ? "Signing in..." : "Admin sign in"}</Text></Pressable>
    <Pressable onPress={() => router.back()}><Text style={{ color: colors.primary, textAlign: "center" }}>Back</Text></Pressable>
  </View>;
}
const styles = StyleSheet.create({ screen: { flex: 1, padding: 25, justifyContent: "center", gap: 15 }, title: { fontSize: 29, fontWeight: "800" }, input: { minHeight: 54, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14 }, button: { minHeight: 54, borderRadius: 13, alignItems: "center", justifyContent: "center" } });
