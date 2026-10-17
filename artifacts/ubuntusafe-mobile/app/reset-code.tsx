import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useApp } from "@/context/AppContext";
import { apiRequest } from "@/lib/api";

export default function ResetCodeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ channel?: string; destination?: string }>();
  const { colors } = useApp();
  const channel = params.channel === "sms" ? "sms" : "email";
  const destination = typeof params.destination === "string" ? params.destination : "";
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);

  const submit = async () => {
    setError("");
    if (!destination.trim()) return setError("Go back and enter the email address or phone number for your account.");
    if (!code.trim()) return setError("Enter the six-digit code.");
    if (!/^\d{6}$/.test(code)) return setError("Enter the six-digit code.");
    if (!password) return setError("Enter a new password.");
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/.test(password)) {
      return setError("Use at least 10 characters with uppercase, lowercase, a number and a symbol.");
    }
    if (!confirmation) return setError("Re-enter your new password.");
    if (password !== confirmation) return setError("The passwords do not match.");
    setBusy(true);
    try {
      await apiRequest<void>("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ channel, destination, code, password }),
      });
      setComplete(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The code may have expired. Request a new one.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>{complete ? "Password updated" : "Enter reset code"}</Text>
      <Text style={{ color: colors.mutedForeground }}>
        {complete ? "Your password has been changed. Sign in with the new password." : `Enter the code sent to ${destination}. It expires in 10 minutes.`}
      </Text>
      {!complete && <>
        <TextInput accessibilityLabel="Six-digit reset code" keyboardType="number-pad" maxLength={6} value={code} onChangeText={setCode} placeholder="Six-digit code" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]} />
        <TextInput accessibilityLabel="New password" secureTextEntry value={password} onChangeText={setPassword} placeholder="New password" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]} />
        <TextInput accessibilityLabel="Confirm new password" secureTextEntry value={confirmation} onChangeText={setConfirmation} placeholder="Confirm new password" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]} />
        {error ? <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{error}</Text> : null}
        <Pressable disabled={busy} onPress={() => void submit()} style={[styles.button, { backgroundColor: colors.primary }]}><Text style={{ color: colors.primaryForeground, fontWeight: "800" }}>{busy ? "Updating..." : "Update password"}</Text></Pressable>
      </>}
      <Pressable onPress={() => router.replace("/sign-in")}><Text style={{ color: colors.primary, textAlign: "center" }}>Back to sign in</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 24, justifyContent: "center", gap: 16 },
  title: { fontSize: 32, fontWeight: "800" },
  input: { minHeight: 54, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, fontSize: 16 },
  button: { minHeight: 54, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});
