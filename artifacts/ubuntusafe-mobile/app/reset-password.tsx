import { useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useApp } from "@/context/AppContext";
import { apiRequest } from "@/lib/api";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const { colors } = useApp();
  const [token, setToken] = useState(
    typeof params.token === "string" ? params.token : "",
  );
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");

  const readToken = (value: string) => {
    const input = value.trim();
    const linkedToken = input.match(/[?&]token=([a-f0-9]{64})(?:$|[&#])/i);
    return (linkedToken?.[1] ?? input).toLowerCase();
  };

  useEffect(() => {
    if (typeof params.token === "string") setToken(params.token);
  }, [params.token]);

  const submit = async () => {
    const resetToken = readToken(token);
    if (!/^[a-f0-9]{64}$/i.test(resetToken)) {
      setError("Paste the reset link or its full token from the email.");
      return;
    }
    if (password.length < 8) {
      setError("Your new password must be at least 8 characters.");
      return;
    }
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await apiRequest<void>("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token: resetToken, password }),
      });
      setComplete(true);
      setPassword("");
      setConfirmation("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not reset the password. Request a new reset link and try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>
        {complete ? "Password updated" : "Reset password"}
      </Text>
      {complete ? (
        <>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>
            Your password has been changed. Sign in with your new password.
          </Text>
          <Pressable
            onPress={() => router.replace("/sign-in")}
            style={[styles.button, { backgroundColor: colors.primary }]}
          >
            <Text style={{ color: colors.primaryForeground, fontWeight: "800" }}>
              Back to sign in
            </Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>
            Open the reset link from your email or paste the full link or token
            below. Reset links expire after 30 minutes and work once.
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
            autoCorrect={false}
            placeholder="Reset link or token"
            placeholderTextColor={colors.mutedForeground}
            value={token}
            onChangeText={setToken}
          />
          <TextInput
            style={[
              styles.input,
              {
                color: colors.foreground,
                borderColor: colors.border,
                backgroundColor: colors.card,
              },
            ]}
            autoComplete="new-password"
            placeholder="New password (at least 8 characters)"
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <TextInput
            style={[
              styles.input,
              {
                color: colors.foreground,
                borderColor: colors.border,
                backgroundColor: colors.card,
              },
            ]}
            autoComplete="new-password"
            placeholder="Confirm new password"
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry
            value={confirmation}
            onChangeText={setConfirmation}
          />
          {error ? (
            <Text accessibilityRole="alert" style={{ color: colors.destructive }}>
              {error}
            </Text>
          ) : null}
          <Pressable
            disabled={busy}
            onPress={() => void submit()}
            style={[styles.button, { backgroundColor: colors.primary }]}
          >
            <Text style={{ color: colors.primaryForeground, fontWeight: "800" }}>
              {busy ? "Updating..." : "Update password"}
            </Text>
          </Pressable>
          <Pressable onPress={() => router.replace("/sign-in")}>
            <Text style={{ color: colors.mutedForeground, textAlign: "center" }}>
              Back to sign in
            </Text>
          </Pressable>
        </>
      )}
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
