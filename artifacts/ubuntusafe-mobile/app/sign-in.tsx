import { useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useApp } from "@/context/AppContext";

export default function SignInScreen() {
  const router = useRouter();
  const {
    colors,
    t,
    signIn,
    biometricUser,
    biometricAvailable,
    biometricSignIn,
  } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setError("");
    const normalizedEmail = email.trim();
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(normalizedEmail);
    if (!normalizedEmail && !password)
      return setError("Enter a valid email and a valid password.");
    if (!normalizedEmail || !validEmail)
      return setError("Enter a valid email address.");
    if (!password) return setError("Enter a valid password.");
    setBusy(true);
    try {
      await signIn(email, password);
      router.replace("/(tabs)");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not sign in. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  const unlock = async () => {
    setBusy(true);
    try {
      if (await biometricSignIn()) router.replace("/(tabs)");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Try signing in with your password.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>
        {t("signIn")}
      </Text>
      {biometricUser && biometricAvailable && (
        <Pressable
          disabled={busy}
          onPress={() => void unlock()}
          style={[styles.button, { backgroundColor: colors.secondary }]}
        >
          <Text
            style={{ color: colors.secondaryForeground, fontWeight: "800" }}
          >
            Unlock as {biometricUser.fullName} with biometrics
          </Text>
        </Pressable>
      )}
      {biometricUser && !biometricAvailable && (
        <Text style={{ color: colors.mutedForeground }}>
          Biometric unlock is unavailable. Sign in with your password.
        </Text>
      )}
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
        keyboardType="email-address"
        placeholder={t("email")}
        placeholderTextColor={colors.mutedForeground}
        value={email}
        onChangeText={setEmail}
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
        placeholder={t("password")}
        placeholderTextColor={colors.mutedForeground}
        secureTextEntry={!showPassword}
        value={password}
        onChangeText={setPassword}
      />
      <Pressable onPress={() => setShowPassword((visible) => !visible)}>
        <Text style={{ color: colors.primary }}>
          {showPassword ? "Hide password" : "Show password"}
        </Text>
      </Pressable>
      {error ? (
        <Text accessibilityRole="alert" style={{ color: colors.destructive }}>
          {error}
        </Text>
      ) : null}
      <Pressable
        disabled={busy}
        onPress={submit}
        style={[styles.button, { backgroundColor: colors.primary }]}
      >
        <Text style={{ color: colors.primaryForeground }}>
          {busy ? "Signing in..." : t("signIn")}
        </Text>
      </Pressable>
      <Pressable onPress={() => router.push("/forgot-password")}>
        <Text style={{ color: colors.primary, textAlign: "center" }}>
          {t("forgotPassword")}
        </Text>
      </Pressable>
      <Pressable onPress={() => router.replace("/create-account")}>
        <Text style={{ color: colors.primary, textAlign: "center" }}>
          {t("createAccount")}
        </Text>
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, padding: 24, justifyContent: "center", gap: 14 },
  title: { fontSize: 32, fontWeight: "800", marginBottom: 12 },
  input: {
    height: 54,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  button: {
    height: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
});
