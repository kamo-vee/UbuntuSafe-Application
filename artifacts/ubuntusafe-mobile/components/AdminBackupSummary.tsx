import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { getGetBackupOverviewQueryKey, useCreateDatabaseBackup, useGetBackupOverview } from "@workspace/api-client-react";
import { useApp } from "@/context/AppContext";
import { errorMessage } from "@/lib/admin-export";

export function AdminBackupSummary() {
  const { colors } = useApp();
  const router = useRouter();
  const q = useGetBackupOverview({ query: { queryKey: getGetBackupOverviewQueryKey(), staleTime: 30000, refetchInterval: 60000, refetchOnWindowFocus: true } });
  const run = useCreateDatabaseBackup();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const data = q.data;
  const isAdmin = data?.role === "admin";
  const latest = data?.databaseBackups.reduce<typeof data.databaseBackups[number] | undefined>(
    (a, b) => (!a || new Date(b.createdAt) > new Date(a.createdAt) ? b : a), undefined);
  const canRun = !!data && isAdmin && data.ready && !run.isPending;

  const backupNow = async () => {
    setMsg(null);
    try {
      const file = await run.mutateAsync();
      await q.refetch();
      setMsg({ ok: true, text: `Backup completed ${new Date(file.createdAt).toLocaleString()}` });
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e, "Backup failed.") });
    }
  };

  return (
    <View testID="admin-backup-summary" style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[s.title, { color: colors.foreground }]}>Backups</Text>
      {q.isLoading ? <Text style={{ color: colors.mutedForeground }}>Loading backup status...</Text> : null}
      {q.error ? <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{errorMessage(q.error, "Could not load backup status.")}</Text> : null}
      {data && !isAdmin ? <Text accessibilityRole="alert" style={{ color: colors.destructive }}>Administrator sign-in required.</Text> : null}
      {data && isAdmin ? <>
        <Text style={[s.label, { color: colors.mutedForeground }]}>Latest backup</Text>
        <Text testID="text-latest-backup" style={[s.big, { color: colors.foreground }]}>
          {latest ? new Date(latest.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" }) : "None yet"}
        </Text>
        <Text style={{ color: !data.ready ? colors.destructive : data.enabled ? colors.primary : colors.destructive, fontWeight: "700" }}>
          {!data.ready ? "Setup required: encryption key not configured" : data.enabled ? `Automatic every ${data.scheduleHours} h` : "Automatic backups off"}
        </Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{data.databaseBackups.length} stored · kept {data.retentionDays} days</Text>
      </> : null}
      {msg ? <Text accessibilityRole="alert" style={{ color: msg.ok ? colors.primary : colors.destructive }}>{msg.text}</Text> : null}
      <View style={s.actions}>
        <Pressable testID="button-backup-now" accessibilityRole="button" disabled={!canRun} onPress={() => void backupNow()}
          style={[s.button, { backgroundColor: colors.primary, opacity: canRun ? 1 : 0.5 }]}>
          <Text style={{ color: colors.primaryForeground, fontWeight: "800" }}>{run.isPending ? "Backing up..." : "Back up now"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push("/backup")}
          style={[s.button, { borderWidth: 1, borderColor: colors.border }]}>
          <Text style={{ color: colors.foreground, fontWeight: "700" }}>Backups and restore</Text>
        </Pressable>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 6 },
  title: { fontSize: 19, fontWeight: "800" },
  label: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
  big: { fontSize: 18, fontWeight: "800" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  button: { minHeight: 46, borderRadius: 12, paddingHorizontal: 14, justifyContent: "center", alignItems: "center" },
});
