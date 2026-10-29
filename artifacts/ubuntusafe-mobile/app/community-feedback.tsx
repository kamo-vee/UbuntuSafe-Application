import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useApp } from "@/context/AppContext";
import { goBackOrReplace } from "@/lib/navigation";
import { apiRequest } from "@/lib/api";
type Feedback = { id: string; message: string; fullName: string; email: string; createdAt: string };
export default function CommunityFeedbackScreen() {
  const router = useRouter(); const { colors } = useApp(); const [items, setItems] = useState<Feedback[]>([]); const [busy, setBusy] = useState(true); const [error, setError] = useState("");
  const load = useCallback(async () => { setBusy(true); setError(""); try { setItems(await apiRequest<Feedback[]>("/admin/feedback")); } catch (e) { setError(e instanceof Error ? e.message : "Could not load feedback."); } finally { setBusy(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  return <View style={[styles.screen, { backgroundColor: colors.background }]}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}><Pressable onPress={() => goBackOrReplace(router, "/admin-dashboard")}><Text style={{ color: colors.primary }}>Back</Text></Pressable><Text style={[styles.title, { color: colors.foreground }]}>Community feedback</Text></View>
    {busy ? <ActivityIndicator color={colors.primary} /> : error ? <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{error}</Text> : <ScrollView>{items.map((item) => <View key={item.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={{ color: colors.foreground, fontWeight: "800" }}>{item.fullName} · {item.email}</Text><Text style={{ color: colors.mutedForeground, marginVertical: 8 }}>{new Date(item.createdAt).toLocaleString()}</Text><Text style={{ color: colors.foreground }}>{item.message}</Text></View>)}</ScrollView>}
  </View>;
}
const styles = StyleSheet.create({ screen: { flex: 1, padding: 20, paddingTop: 58, gap: 14 }, title: { fontSize: 24, fontWeight: "800" }, card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 } });
