import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useApp } from "@/context/AppContext";
import { apiRequest } from "@/lib/api";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { colors } = useApp();
  const channel = "email";
  const [destination, setDestination] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    const normalized = destination.trim();
    setError("");
    if (channel === "email" && !normalized) {
      setError("Enter your email address.");
      return;
    }
    if (channel === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    try {
      await apiRequest<{ message: string }>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ channel, destination: normalized }),
      });
      setSent(true);
      router.push({ pathname: "/reset-code", params: { channel, destination: normalized } });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not send the request. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>
        Forgot password?
      </Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>
        Enter your account email to receive a six-digit code. It expires after 10 minutes. SMS is not required.
      </Text>
      <TextInput
        style={[
          styles.input,
          {
            color: colors.foreground,
            borderColor: colors.border,
            backgroundColor: colors.card,
          },
        ]}
        autoCapitalize="none"
        autoComplete={channel === "email" ? "email" : "tel"}
        keyboardType={channel === "email" ? "email-address" : "phone-pad"}
        placeholder={channel === "email" ? "Email address" : "Phone (+country code)"}
        placeholderTextColor={colors.mutedForeground}
        value={destination}
        onChangeText={setDestination}
      />
      {error ? (
        <Text accessibilityRole="alert" style={{ color: colors.destructive }}>
          {error}
        </Text>
      ) : null}
      {sent ? (
        <Text style={[styles.body, { color: colors.secondaryForeground }]}>
          If an account exists for that contact, a six-digit code has been sent.
        </Text>
      ) : (
        <Pressable
          disabled={busy}
          onPress={() => void submit()}
          style={[styles.button, { backgroundColor: colors.primary }]}
        >
          <Text style={{ color: colors.primaryForeground, fontWeight: "800" }}>
            {busy ? "Sending..." : "Send reset code"}
          </Text>
        </Pressable>
      )}
      <Pressable onPress={() => router.replace("/sign-in")}>
        <Text style={{ color: colors.mutedForeground, textAlign: "center" }}>
          Back to sign in
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 24, justifyContent: "center", gap: 16 },
  title: { fontSize: 32, fontWeight: "800" },
  body: { fontSize: 16, lineHeight: 24 },
  input: {
    minHeight: 54,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  button: {
    minHeight: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
});
