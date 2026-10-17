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
  const [channel, setChannel] = useState<"email" | "sms">("email");
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
    if (channel === "sms" && !normalized) {
      setError("Enter your phone number.");
      return;
    }
    if (channel === "sms" && !/^\+[1-9]\d{7,14}$/.test(normalized)) {
      setError("Enter your phone number in international format, for example +27821234567.");
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
        Choose where to receive a six-digit code. It expires after 10 minutes.
      </Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {(["email", "sms"] as const).map((option) => (
          <Pressable key={option} onPress={() => setChannel(option)} style={[styles.button, { flex: 1, backgroundColor: channel === option ? colors.primary : colors.card, borderColor: colors.border, borderWidth: 1 }]}>
            <Text style={{ color: channel === option ? colors.primaryForeground : colors.foreground, fontWeight: "700", textAlign: "center" }}>{option === "email" ? "Email" : "Phone"}</Text>
          </Pressable>
        ))}
      </View>
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
            {busy ? "Sending..." : "Send reset link"}
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
