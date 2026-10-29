import { useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useApp } from "@/context/AppContext";
import { validateAccountFields, type RegistrationField } from "@/lib/account-fields";

export default function CreateAccountScreen() {
  const router = useRouter();
  const { colors, register, enableBiometrics, signOut } = useApp();
  const [fullName, setFullName] = useState("");
  const [surname, setSurname] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [useBiometrics, setUseBiometrics] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<RegistrationField, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<RegistrationField, boolean>>>({});
  const inputs = useRef<Partial<Record<RegistrationField, TextInput | null>>>({});
  const values = { fullName, surname, dateOfBirth, email, phone, password, confirmPassword };

  const submit = async () => {
    setError("");
    const problems = validateAccountFields(values);
    setFieldErrors(problems);
    const first = (Object.keys(values) as RegistrationField[]).find(key => problems[key]);
    if (first) {
      setTouched(Object.fromEntries(Object.keys(values).map(key => [key, true])));
      inputs.current[first]?.focus();
      return;
    }
    setBusy(true);
    try {
      const created = await register(fullName.trim(), surname.trim(), dateOfBirth, email.trim(), phone.trim() || null, password, false);
      if (created.verificationRequired) {
        await signOut();
        router.replace({
          pathname: "/verify-email",
          params: { email: email.trim().toLowerCase(), sent: created.verificationEmailSent ? "1" : "0" },
        });
        return;
      }
      if (useBiometrics) {
        try { await enableBiometrics(true, created); }
        catch { Alert.alert("Account created", "Biometrics could not be enabled on this device. You can sign in with your password."); }
      }
      await signOut();
      Alert.alert("Account created", "You have created your account. You can sign in now.");
      router.replace("/sign-in");
    } catch (cause) {
      const fields = cause && typeof cause === "object" && "fieldErrors" in cause ? cause.fieldErrors : null;
      if (fields && typeof fields === "object") {
        setFieldErrors(fields as Partial<Record<RegistrationField, string>>);
        const first = Object.keys(fields)[0] as RegistrationField;
        inputs.current[first]?.focus();
      } else setError(cause instanceof Error ? cause.message : "Could not create your account. Please try again.");
      if (useBiometrics) await signOut().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  const fieldOrder: RegistrationField[] = ["fullName", "surname", "dateOfBirth", "email", "phone", "password", "confirmPassword"];
  let inputIndex = 0;
  const input = (label: string, value: string, setValue: (next: string) => void, props: Record<string, unknown> = {}) => {
    const field = fieldOrder[inputIndex++];
    return <View style={{ gap: 5, ...(field === "password" ? { flex: 1 } : {}) }}>
      <Text style={{ color: colors.foreground, fontWeight: "600" }}>{label}</Text>
      <TextInput ref={element => { inputs.current[field] = element; }} testID={`register-${field}`}
        accessibilityLabel={label} accessibilityHint={fieldErrors[field] || undefined}
        placeholder={label} placeholderTextColor={colors.mutedForeground} value={value} editable={!busy}
        onChangeText={next => {
          setValue(next); setError("");
          setFieldErrors(current => ({ ...current, [field]: touched[field] ? validateAccountFields({ ...values, [field]: next })[field] : undefined,
            ...(field === "password" && touched.confirmPassword ? { confirmPassword: validateAccountFields({ ...values, password: next }).confirmPassword } : {}) }));
        }}
        onBlur={() => { setTouched(current => ({ ...current, [field]: true })); setFieldErrors(current => ({ ...current, [field]: validateAccountFields(values)[field] })); }}
        style={[styles.input, { color: colors.foreground, borderColor: fieldErrors[field] ? colors.destructive : colors.border, backgroundColor: colors.card }]} {...props as any} />
      {fieldErrors[field] ? <Text accessibilityRole="alert" testID={`error-${field}`} style={{ color: colors.destructive, fontSize: 13 }}>{fieldErrors[field]}</Text> : null}
    </View>;
  };
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <Text style={[styles.title, { color: colors.foreground }]}>Create your account</Text>
      <Text style={{ color: colors.mutedForeground }}>Your details are used to protect and manage your account.</Text>
      {input("Full name", fullName, setFullName, { autoCapitalize: "words" })}
      {input("Surname", surname, setSurname, { autoCapitalize: "words" })}
      {input("Date of birth (YYYY-MM-DD)", dateOfBirth, setDateOfBirth, { keyboardType: "numbers-and-punctuation" })}
      {input("Email address", email, setEmail, { autoCapitalize: "none", keyboardType: "email-address", autoComplete: "email" })}
      {input("Phone for recovery (optional, include country code)", phone, setPhone, { autoCapitalize: "none", keyboardType: "phone-pad" })}
      <View style={styles.passwordRow}>{input("Password", password, setPassword, { secureTextEntry: !showPassword, autoCapitalize: "none" })}<Pressable onPress={() => setShowPassword(!showPassword)}><Text style={{ color: colors.primary, fontWeight: "700" }}>{showPassword ? "Hide" : "Show"}</Text></Pressable></View>
      {input("Re-enter password", confirmPassword, setConfirmPassword, { secureTextEntry: !showPassword, autoCapitalize: "none" })}
      <View style={[styles.bio, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={{ flex: 1 }}><Text style={{ color: colors.foreground, fontWeight: "700" }}>Enable biometrics</Text><Text style={{ color: colors.mutedForeground, fontSize: 12 }}>You will verify this on your device.</Text></View><Switch value={useBiometrics} onValueChange={setUseBiometrics} trackColor={{ true: colors.primary }} /></View>
      {error ? <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{error}</Text> : null}
      <Pressable disabled={busy} onPress={() => void submit()} style={[styles.button, { backgroundColor: colors.primary }]}><Text style={{ color: colors.primaryForeground, fontWeight: "800" }}>{busy ? "Creating..." : "Create account"}</Text></Pressable>
      <Pressable onPress={() => router.replace("/sign-in")}><Text style={{ color: colors.primary, textAlign: "center" }}>Already have an account? Sign in</Text></Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 24, paddingTop: 58, paddingBottom: 50, gap: 14 },
  title: { fontSize: 30, fontWeight: "800" },
  input: { minHeight: 52, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, fontSize: 15 },
  passwordRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  bio: { minHeight: 64, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, flexDirection: "row", alignItems: "center" },
  button: { minHeight: 54, borderRadius: 13, alignItems: "center", justifyContent: "center", marginTop: 6 },
});
