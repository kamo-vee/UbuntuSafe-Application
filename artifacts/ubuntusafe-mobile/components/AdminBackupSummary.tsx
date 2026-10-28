import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import type { BackupOverview } from "@workspace/api-client-react";
import { useApp } from "@/context/AppContext";
import { apiRequest } from "@/lib/api";

export function AdminBackupSummary() {
  const { colors } = useApp();
  const router = useRouter();
  const [data, setData] = useState<BackupOverview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await apiRequest<BackupOverview>("/backup");
        if (!active) return;
        if (result.role !== "admin") {
          setData(null);
          setError("Administrator sign-in is required to view system backups.");
        } else {
          setData(result);
          setError("");
        }
      } catch (e) {
        if (active) {
          setData(null);
          setError(e instanceof Error ? e.message : "Could not load backup information.");
        }
      } finally { if (active) setLoading(false); }
    };
    setLoading(true);
    void load();
    const timer = setInterval(() => void load(), 60000);
    return () => { active = false; clearInterval(timer); };
  }, [refresh]));

  const latest = data?.databaseBackups[0];
  const detail = { color: colors.mutedForeground };
  return (
    <View testID="admin-backup-summary" style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>Backup information</Text>
      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      {error ? <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{error}</Text> : null}
      {data ? <>
        <Text style={{ color: data.ready && data.enabled ? colors.primary : colors.destructive, fontWeight: "800" }}>
          {!data.ready ? "Setup required — encryption key not configured" : data.enabled ? "Automatic backups enabled" : "Automatic backups disabled"}
        </Text>
        <Text style={detail}>{data.message}</Text>
        <Text style={detail}>Latest completed database backup: {latest ? new Date(latest.createdAt).toLocaleString() : "None yet"}</Text>
        <Text style={detail}>Completed database backups: {data.databaseBackups.length}{latest ? ` · Latest size: ${(latest.bytes / 1024).toFixed(1)} KB` : ""}</Text>
        <Text style={detail}>Schedule: every {data.scheduleHours} hours · Retention: {data.retentionDays} days</Text>
        <Text style={detail}>Deleted records available in recovery list: {data.deleted.length}</Text>
        <Text style={detail}>Includes user records and community administration data. GitHub backs up code only.</Text>
      </> : null}
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={() => router.push("/backup")}
          style={[styles.button, { backgroundColor: colors.primary }]}>
          <Text style={{ color: colors.primaryForeground, fontWeight: "800" }}>View backups and restore</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={loading} onPress={() => setRefresh(value => value + 1)}
          style={[styles.button, { borderWidth: 1, borderColor: colors.border, opacity: loading ? 0.5 : 1 }]}>
          <Text style={{ color: colors.foreground, fontWeight: "700" }}>Refresh backup status</Text>
        </Pressable>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 9 },
  title: { fontSize: 19, fontWeight: "800" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: { minHeight: 46, borderRadius: 12, paddingHorizontal: 14, justifyContent: "center", alignItems: "center" },
});
