import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { confirmEmailVerification, requestEmailVerification } from "@workspace/api-client-react";
import { useApp } from "@/context/AppContext";

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "data" in error) {
    const data = error.data as { message?: string } | undefined;
    if (data?.message) return data.message;
  }
  return error instanceof Error ? error.message : "The request failed. Please try again.";
}

export default function VerifyEmailScreen() {
  const params = useLocalSearchParams<{ email?: string; sent?: string }>();
  const router = useRouter();
  const { colors } = useApp();
  const [email, setEmail] = useState(params.email ?? "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(params.sent === "1" ? 60 : 0);
  const [message, setMessage] = useState(params.sent === "1"
    ? "A verification code was accepted by the email provider. Check your inbox and spam folder."
    : params.sent === "0"
      ? "Your account was created, but the email provider could not send the code. Your account remains pending. You can try resending."
      : "Enter your email and request a code if you need a new one.");
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  const perform = async (action: "request" | "confirm") => {
    setError("");
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return setError("Enter a valid email address.");
    if (action === "confirm" && !/^\d{6}$/.test(code)) return setError("Enter the six-digit verification code.");
    setBusy(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = action === "request"
        ? await requestEmailVerification({ email: normalized }, { signal: controller.signal })
        : await confirmEmailVerification({ email: normalized, code }, { signal: controller.signal });
      setMessage(response.message);
      if (action === "confirm") setVerified(true);
      else setCooldown(60);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }
  };
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <Text style={[styles.title, { color: colors.foreground }]}>Verify your email</Text>
      <Text style={{ color: colors.mutedForeground, lineHeight: 22 }}>{message}</Text>
      {!verified && <View style={{ gap: 14 }}>
        <TextInput accessibilityLabel="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={colors.mutedForeground} editable={!busy}
          style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]} />
        <TextInput accessibilityLabel="Verification code" keyboardType="number-pad" maxLength={6} value={code} onChangeText={setCode} placeholder="Six-digit code" placeholderTextColor={colors.mutedForeground} editable={!busy}
          style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]} />
        <Text style={{ color: colors.mutedForeground }}>Codes expire in 10 minutes and can be used once. You can enable biometrics in Settings after signing in.</Text>
        <Pressable testID="verify-email-button" accessibilityRole="button" disabled={busy} onPress={() => void perform("confirm")} style={[styles.button, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}>
          <Text style={{ color: colors.primaryForeground, fontWeight: "800" }}>{busy ? "Please wait..." : "Verify email"}</Text>
        </Pressable>
        <Pressable testID="resend-verification-button" accessibilityRole="button" disabled={busy || cooldown > 0} onPress={() => void perform("request")}>
          <Text style={{ color: colors.primary, opacity: busy || cooldown > 0 ? 0.6 : 1 }}>{cooldown ? `Resend available in ${cooldown}s` : "Send a new code"}</Text>
        </Pressable>
      </View>}
      {!!error && <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{error}</Text>}
      <Pressable accessibilityRole="button" onPress={() => router.replace("/sign-in")} style={[styles.button, { backgroundColor: colors.secondary }]}>
        <Text style={{ color: colors.secondaryForeground, fontWeight: "800" }}>{verified ? "Continue to sign in" : "Back to sign in"}</Text>
      </Pressable>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  screen: { flexGrow: 1, padding: 24, paddingTop: 80, paddingBottom: 40, gap: 20 },
  title: { fontSize: 28, fontWeight: "800" },
  input: { borderWidth: 1, borderRadius: 14, padding: 15, minHeight: 52 },
  button: { borderRadius: 14, padding: 16, alignItems: "center", minHeight: 52 },
});
