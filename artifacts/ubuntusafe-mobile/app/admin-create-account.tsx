import { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRegisterAdministrator } from "@workspace/api-client-react";
import { useApp } from "@/context/AppContext";
import { errorMessage, fieldErrorsFrom } from "@/lib/admin-export";
import {
  EMPTY_ADMIN_REG, validateAdminReg, validateAdminRegField,
  type AdminRegField, type AdminRegValues,
} from "@/lib/admin-registration-validation";

const FIELDS: { key: AdminRegField; label: string; secure?: boolean; email?: boolean; hint?: string }[] = [
  { key: "fullName", label: "First name" },
  { key: "surname", label: "Surname" },
  { key: "email", label: "Work email", email: true },
  { key: "password", label: "Password", secure: true, hint: "12 to 72 characters with upper and lower case, a number and a symbol." },
  { key: "confirm", label: "Confirm password", secure: true },
];

export default function AdminCreateAccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useApp();
  const register = useRegisterAdministrator();
  const [v, setV] = useState<AdminRegValues>(EMPTY_ADMIN_REG);
  const [errors, setErrors] = useState<Partial<Record<AdminRegField, string>>>({});
  const [formError, setFormError] = useState("");
  const [show, setShow] = useState(false);
  const [done, setDone] = useState<{ email: string; message: string } | null>(null);

  const set = (f: AdminRegField, t: string) => {
    const next = { ...v, [f]: t };
    setV(next);
    if (errors[f]) setErrors(e => ({ ...e, [f]: validateAdminRegField(f, next) }));
    if (f === "password" && errors.confirm) setErrors(e => ({ ...e, confirm: validateAdminRegField("confirm", next) }));
  };

  const submit = async () => {
    if (register.isPending) return;
    const all = validateAdminReg(v);
    setErrors(all); setFormError("");
    if (Object.keys(all).length) return;
    try {
      const r = await register.mutateAsync({
        data: { fullName: v.fullName.trim(), surname: v.surname.trim(), email: v.email.trim().toLowerCase(), password: v.password },
      });
      setV(EMPTY_ADMIN_REG);
      setDone({ email: r.email, message: r.message });
    } catch (e) {
      const fe = fieldErrorsFrom(e);
      if (Object.keys(fe).length) setErrors(fe as Partial<Record<AdminRegField, string>>);
      setFormError(errorMessage(e, "Could not submit the administrator request."));
    }
  };

  const top = Platform.OS === "web" ? 67 : insets.top + 16;

  if (done) {
    return (
      <View style={[s.center, { backgroundColor: colors.background, paddingTop: top }]}>
        <View testID="admin-request-submitted" style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[s.badge, { color: colors.secondaryForeground, backgroundColor: colors.secondary }]}>PENDING APPROVAL</Text>
          <Text style={[s.title, { color: colors.foreground }]}>Request submitted</Text>
          <Text accessibilityRole="alert" style={{ color: colors.foreground, lineHeight: 22 }}>{done.message}</Text>
          <Text style={{ color: colors.mutedForeground, lineHeight: 20 }}>
            {done.email} can sign in once an existing administrator approves it. No email is sent; check back later.
          </Text>
          <Pressable testID="button-go-admin-sign-in" accessibilityRole="button" onPress={() => router.replace("/admin-sign-in")} style={[s.btn, { backgroundColor: colors.primary }]}>
            <Text style={{ color: colors.primaryForeground, fontWeight: "800" }}>Go to administrator sign in</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} keyboardShouldPersistTaps="handled"
      contentContainerStyle={[s.screen, { paddingTop: top, paddingBottom: insets.bottom + 34 }]}>
      <Text style={[s.badge, { color: colors.secondaryForeground, backgroundColor: colors.secondary }]}>ADMINISTRATOR ACCOUNT</Text>
      <Text style={[s.title, { color: colors.foreground }]}>Create administrator account</Text>
      <Text style={{ color: colors.mutedForeground, lineHeight: 21 }}>
        For people who manage UbuntuSafe. An existing administrator must approve it before you can sign in.
      </Text>
      <Pressable accessibilityRole="link" onPress={() => router.push("/create-account")}>
        <Text style={{ color: colors.primary, fontWeight: "700" }}>Want protection for yourself? Create a user account instead</Text>
      </Pressable>

      {FIELDS.map(({ key, label, secure, email, hint }) => (
        <View key={key} style={s.field}>
          <Text nativeID={`label-${key}`} style={[s.label, { color: colors.foreground }]}>{label}</Text>
          <View style={s.inputRow}>
            <TextInput
              testID={`input-admin-reg-${key}`} value={v[key]} onChangeText={t => set(key, t)}
              onBlur={() => setErrors(e => ({ ...e, [key]: validateAdminRegField(key, v) }))}
              secureTextEntry={secure && !show} autoCapitalize={secure || email ? "none" : "words"} autoCorrect={false}
              keyboardType={email ? "email-address" : "default"} autoComplete={secure ? "new-password" : email ? "email" : "off"}
              accessibilityLabel={label} accessibilityLabelledBy={`label-${key}`} accessibilityHint={errors[key] || hint}
              editable={!register.isPending}
              style={[s.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: errors[key] ? colors.destructive : colors.border }]}
            />
            {key === "password" ? (
              <Pressable testID="button-toggle-password" accessibilityRole="button" accessibilityLabel={show ? "Hide passwords" : "Show passwords"}
                onPress={() => setShow(x => !x)} style={[s.reveal, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Text style={{ color: colors.primary, fontWeight: "700" }}>{show ? "Hide" : "Show"}</Text>
              </Pressable>
            ) : null}
          </View>
          {errors[key] ? <Text accessibilityRole="alert" style={[s.err, { color: colors.destructive }]}>{errors[key]}</Text>
            : hint ? <Text style={[s.err, { color: colors.mutedForeground }]}>{hint}</Text> : null}
        </View>
      ))}

      {formError ? <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{formError}</Text> : null}
      <Pressable testID="button-submit-admin-request" accessibilityRole="button" accessibilityState={{ busy: register.isPending, disabled: register.isPending }}
        disabled={register.isPending} onPress={() => void submit()}
        style={[s.btn, { backgroundColor: colors.primary, opacity: register.isPending ? 0.6 : 1 }]}>
        <Text style={{ color: colors.primaryForeground, fontWeight: "800" }}>{register.isPending ? "Submitting..." : "Request administrator account"}</Text>
      </Pressable>
      <Pressable accessibilityRole="link" onPress={() => router.replace("/admin-sign-in")}>
        <Text style={{ color: colors.primary, textAlign: "center" }}>Already approved? Administrator sign in</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { paddingHorizontal: 24, gap: 14 },
  center: { flex: 1, padding: 24, justifyContent: "center" },
  card: { borderWidth: 1, borderRadius: 16, padding: 20, gap: 12 },
  badge: { alignSelf: "flex-start", fontSize: 11, fontWeight: "800", letterSpacing: 0.8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: "hidden" },
  title: { fontSize: 27, fontWeight: "800" },
  field: { gap: 5 },
  label: { fontSize: 14, fontWeight: "700" },
  inputRow: { flexDirection: "row", gap: 8 },
  input: { flex: 1, minHeight: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 16 },
  reveal: { minHeight: 52, minWidth: 64, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  err: { fontSize: 12, lineHeight: 17 },
  btn: { minHeight: 54, borderRadius: 13, alignItems: "center", justifyContent: "center", marginTop: 4 },
});
