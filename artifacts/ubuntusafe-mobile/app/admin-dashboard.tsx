import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useApp } from "@/context/AppContext";
import { apiRequest } from "@/lib/api";

type DailyRecord = { userId: string; fullName: string; surname: string; email: string; dateOfBirth: string | null; lastSignedInAt: string | null; scanDate: string; scans: { kind: string; status: string }[] };
export default function AdminDashboardScreen() {
  const router = useRouter(); const { colors, signOut } = useApp();
  const [records, setRecords] = useState<DailyRecord[]>([]); const [busy, setBusy] = useState(true); const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const load = useCallback(async () => { setBusy(true); setError(""); try { setRecords(await apiRequest<DailyRecord[]>("/admin/records")); } catch (e) { setError(e instanceof Error ? e.message : "Could not load records."); } finally { setBusy(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await signOut();
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not log out. Please try again.");
    } finally {
      setLoggingOut(false);
    }
  };
  return <View style={[styles.screen, { backgroundColor: colors.background }]}>
    <Text style={[styles.title, { color: colors.foreground }]}>Admin dashboard</Text>
    <Pressable accessibilityRole="button" disabled={loggingOut} onPress={() => void logout()} style={[styles.action, { backgroundColor: colors.primary, opacity: loggingOut ? 0.65 : 1 }]}><Text style={{ color: colors.primaryForeground, fontWeight: "800" }}>{loggingOut ? "Signing out..." : "Log out"}</Text></Pressable>
    <View style={styles.actions}>
      <Pressable onPress={() => router.push({ pathname: "/community", params: { admin: "1" } })} style={[styles.action, { backgroundColor: colors.primary }]}><Text style={{ color: colors.primaryForeground, fontWeight: "700" }}>Community reports</Text></Pressable>
      <Pressable onPress={() => router.push("/community-feedback")} style={[styles.action, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}><Text style={{ color: colors.foreground, fontWeight: "700" }}>Community feedback</Text></Pressable>
    </View>
    <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Daily scan summaries. Each person’s scans are grouped into one row per day.</Text>
    {busy ? <ActivityIndicator color={colors.primary} /> : error ? <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{error}</Text> : <ScrollView horizontal><ScrollView style={{ maxHeight: 470 }}><View>
      <View style={[styles.row, { backgroundColor: colors.secondary }]}>{["User", "Email", "Date of birth", "Last sign-in", "Day", "Scans"].map((h) => <Text key={h} style={[styles.cell, { color: colors.foreground, fontWeight: "800" }]}>{h}</Text>)}</View>
      {records.map((r, i) => <View key={`${r.userId}-${r.scanDate}-${i}`} style={[styles.row, { borderBottomColor: colors.border }]}><Text style={[styles.cell, { color: colors.foreground }]}>{r.fullName} {r.surname}</Text><Text style={[styles.cell, { color: colors.foreground }]}>{r.email}</Text><Text style={[styles.cell, { color: colors.foreground }]}>{r.dateOfBirth ?? "—"}</Text><Text style={[styles.cell, { color: colors.foreground }]}>{r.lastSignedInAt ? new Date(r.lastSignedInAt).toLocaleString() : "—"}</Text><Text style={[styles.cell, { color: colors.foreground }]}>{r.scanDate}</Text><Text style={[styles.cell, { color: colors.foreground }]}>{r.scans.map((s) => `${s.kind}: ${s.status}`).join(", ") || "No scans"}</Text></View>)}
      {records.length === 0 ? <Text style={{ color: colors.mutedForeground, padding: 16 }}>No records yet.</Text> : null}
    </View></ScrollView></ScrollView>}
    <Pressable onPress={() => void load()} style={[styles.action, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}><Text style={{ color: colors.primary, fontWeight: "700" }}>Refresh records</Text></Pressable>
  </View>;
}
const styles = StyleSheet.create({ screen: { flex: 1, padding: 20, paddingTop: 54, gap: 14 }, title: { fontSize: 29, fontWeight: "800" }, subtitle: { lineHeight: 20 }, actions: { gap: 9 }, action: { minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 }, row: { flexDirection: "row", minHeight: 48, alignItems: "center", borderBottomWidth: 1 }, cell: { width: 170, paddingHorizontal: 10, fontSize: 12 } });
