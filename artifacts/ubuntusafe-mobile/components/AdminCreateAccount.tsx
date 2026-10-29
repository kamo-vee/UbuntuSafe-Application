import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAdministratorAccountsQueryKey, useCreateAdministratorAccount, useGetAdministratorAccounts,
} from "@workspace/api-client-react";
import { useApp } from "@/context/AppContext";
import { errorMessage, fieldErrorsFrom } from "@/lib/admin-export";

type Field = "fullName" | "surname" | "email" | "password" | "confirm";
type Values = Record<Field, string>;
const EMPTY: Values = { fullName: "", surname: "", email: "", password: "", confirm: "" };
const NAME_RE = /^[\p{L} '.-]+$/u;

function validateName(v: string, label: string) {
  const t = v.trim();
  if (!t) return `${label} is required.`;
  if (t.length < 2 || t.length > 80) return `${label} must be 2 to 80 characters.`;
  if (!NAME_RE.test(t)) return `${label} may only use letters, spaces, apostrophes, hyphens and periods.`;
  if ((t.match(/\p{L}/gu) ?? []).length < 2) return `${label} needs at least 2 letters.`;
  return "";
}
function validate(f: Field, v: Values): string {
  switch (f) {
    case "fullName": return validateName(v.fullName, "First name");
    case "surname": return validateName(v.surname, "Surname");
    case "email": {
      const t = v.email.trim();
      if (!t) return "Email is required.";
      if (t.length > 200) return "Email must be 200 characters or fewer.";
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t) ? "" : "Enter a valid email address.";
    }
    case "password": {
      const p = v.password;
      if (!p) return "Password is required.";
      if (p !== p.trim()) return "Password cannot start or end with spaces.";
      if (p.length < 12 || p.length > 72) return "Password must be 12 to 72 characters.";
      if (!/[A-Z]/.test(p)) return "Add an uppercase letter.";
      if (!/[a-z]/.test(p)) return "Add a lowercase letter.";
      if (!/[0-9]/.test(p)) return "Add a number.";
      if (!/[^A-Za-z0-9\s]/.test(p)) return "Add a symbol.";
      return "";
    }
    case "confirm": return !v.confirm ? "Confirm the password." : v.confirm !== v.password ? "Passwords do not match." : "";
  }
}

const FIELDS: { key: Field; label: string; secure?: boolean; email?: boolean }[] = [
  { key: "fullName", label: "First name" }, { key: "surname", label: "Surname" },
  { key: "email", label: "Email", email: true }, { key: "password", label: "Password", secure: true },
  { key: "confirm", label: "Confirm password", secure: true },
];

export function AdminCreateAccount() {
  const { colors } = useApp();
  const qc = useQueryClient();
  const [v, setV] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState("");
  const [done, setDone] = useState("");
  const accounts = useGetAdministratorAccounts({ query: { queryKey: getGetAdministratorAccountsQueryKey(), staleTime: 30000, refetchOnWindowFocus: true } });
  const create = useCreateAdministratorAccount({
    mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getGetAdministratorAccountsQueryKey() }) },
  });

  const set = (f: Field, text: string) => {
    const next = { ...v, [f]: text };
    setV(next); setDone("");
    if (errors[f]) setErrors(e => ({ ...e, [f]: validate(f, next) }));
  };
  const submit = () => {
    const all: Partial<Record<Field, string>> = {};
    FIELDS.forEach(({ key }) => { const m = validate(key, v); if (m) all[key] = m; });
    setErrors(all); setFormError(""); setDone("");
    if (Object.keys(all).length) return;
    create.mutate(
      { data: { fullName: v.fullName.trim(), surname: v.surname.trim(), email: v.email.trim().toLowerCase(), password: v.password } },
      {
        onSuccess: a => { setV(EMPTY); setErrors({}); setDone(`Administrator ${a.email} created.`); },
        onError: e => {
          const fe = fieldErrorsFrom(e);
          if (Object.keys(fe).length) setErrors(fe as Partial<Record<Field, string>>);
          setFormError(errorMessage(e, "Could not create administrator."));
        },
      },
    );
  };

  return (
    <View testID="admin-create-account" style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[s.title, { color: colors.foreground }]}>Add administrator</Text>
      {FIELDS.map(({ key, label, secure, email }) => (
        <View key={key} style={s.field}>
          <Text style={[s.label, { color: colors.foreground }]}>{label}</Text>
          <TextInput
            testID={`input-admin-${key}`} value={v[key]} onChangeText={t => set(key, t)}
            onBlur={() => setErrors(e => ({ ...e, [key]: validate(key, v) }))}
            secureTextEntry={secure} autoCapitalize={secure || email ? "none" : "words"} autoCorrect={false}
            keyboardType={email ? "email-address" : "default"} accessibilityLabel={label}
            style={[s.input, { color: colors.foreground, borderColor: errors[key] ? colors.destructive : colors.border, backgroundColor: colors.background }]}
          />
          {errors[key] ? <Text accessibilityRole="alert" style={[s.err, { color: colors.destructive }]}>{errors[key]}</Text> : null}
        </View>
      ))}
      {formError ? <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{formError}</Text> : null}
      {done ? <Text style={{ color: colors.primary, fontWeight: "700" }}>{done}</Text> : null}
      <Pressable testID="button-create-admin" accessibilityRole="button" disabled={create.isPending} onPress={submit}
        style={[s.btn, { backgroundColor: colors.primary, opacity: create.isPending ? 0.6 : 1 }]}>
        <Text style={{ color: colors.primaryForeground, fontWeight: "800" }}>{create.isPending ? "Creating..." : "Create administrator"}</Text>
      </Pressable>
      <Text style={[s.sub, { color: colors.foreground }]}>Administrators</Text>
      {accounts.isLoading ? <Text style={{ color: colors.mutedForeground }}>Loading...</Text>
        : accounts.error ? <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{errorMessage(accounts.error, "Could not load administrators.")}</Text>
        : (accounts.data ?? []).length === 0 ? <Text style={{ color: colors.mutedForeground }}>No administrators listed.</Text>
        : accounts.data!.map(a => (
          <View key={a.id} style={[s.row, { borderBottomColor: colors.border }]}>
            <Text style={{ color: colors.foreground, fontWeight: "700" }}>{a.fullName} {a.surname}</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{a.email} · added {new Date(a.createdAt).toLocaleDateString()}</Text>
          </View>
        ))}
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 10 },
  title: { fontSize: 19, fontWeight: "800" },
  sub: { fontSize: 15, fontWeight: "800", marginTop: 6 },
  field: { gap: 4 },
  label: { fontSize: 13, fontWeight: "700" },
  input: { borderWidth: 1, borderRadius: 10, minHeight: 46, paddingHorizontal: 12, fontSize: 15 },
  err: { fontSize: 12 },
  btn: { minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  row: { paddingVertical: 8, borderBottomWidth: 1, gap: 2 },
});
