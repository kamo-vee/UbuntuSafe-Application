import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useApp } from "@/context/AppContext";
import { apiRequest, getAuthToken } from "@/lib/api";
import { syncNow } from "@/lib/sync";

type BackupFile = { id: string; createdAt: string; bytes: number };
type DeletedKind = "scans" | "reports" | "feedback" | "users";
type DeletedRecord = { kind: DeletedKind; id: string; title: string; deletedAt: string };
type Overview = { role: "user" | "admin"; enabled: boolean; ready: boolean; message: string; scheduleHours: number; retentionDays: number; databaseBackups: BackupFile[]; snapshots: BackupFile[]; deleted: DeletedRecord[] };
type Pending = { action: "record" | "snapshot"; id: string; kind?: DeletedKind; label: string } | null;

const fmtBytes = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`);
const fmtDate = (s: string) => { const d = new Date(s); return Number.isNaN(d.getTime()) ? s : d.toLocaleString(); };
const msg = (e: unknown, f: string) => (e instanceof Error ? e.message : f);

export default function BackupScreen() {
  const router = useRouter();
  const { colors, user, hydrated } = useApp();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [working, setWorking] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const workingRef = useRef(false);
  const loadingRef = useRef(false);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const token = await getAuthToken().catch(() => null);
      if (!token && !user) { router.replace("/sign-in"); return; }
      setData(await apiRequest<Overview>("/backup"));
      setError("");
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 401) { router.replace("/sign-in"); return; }
      setError(msg(e, "Could not load backup status."));
    } finally { loadingRef.current = false; setLoading(false); }
  }, [user, router]);

  useFocusEffect(useCallback(() => { if (hydrated) void load(); }, [hydrated, load]));

  const run = async (fn: (isUser: boolean) => Promise<string>) => {
    if (workingRef.current || !data) return;
    workingRef.current = true; setWorking(true); setError(""); setSuccess("");
    try { setSuccess(await fn(data.role === "user")); setPending(null); }
    catch (e) { setError(msg(e, "The backup action failed.")); }
    finally { workingRef.current = false; setWorking(false); await load().catch(() => undefined); }
  };

  const createDb = () => run(async () => { const f = await apiRequest<BackupFile>("/backup/database", { method: "POST" }); return `Encrypted database backup created (${fmtBytes(f.bytes)}).`; });
  const createSnap = () => run(async (isUser) => { if (isUser) await syncNow(); const f = await apiRequest<BackupFile>("/backup/snapshot", { method: "POST" }); return `Encrypted snapshot created (${fmtBytes(f.bytes)}).`; });
  const restore = (p: NonNullable<Pending>) => run(async (isUser) => {
    if (isUser) await syncNow();
    const r = await apiRequest<{ restored: number; message: string }>("/backup/restore", { method: "POST", body: JSON.stringify({ action: p.action, id: p.id, ...(p.kind ? { kind: p.kind } : {}) }) });
    if (isUser) await syncNow();
    return r.message || `${r.restored} record(s) restored.`;
  });

  const card = [styles.card, { backgroundColor: colors.card, borderColor: colors.border }];
  const btn = (primary: boolean, disabled: boolean) => [styles.action, primary ? { backgroundColor: colors.primary } : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }, { opacity: disabled ? 0.6 : 1 }];

  const confirmBox = (p: NonNullable<Pending>) => pending && pending.id === p.id && pending.action === p.action ? (
    <View accessibilityRole="alert" style={[styles.confirm, { borderColor: colors.primary, backgroundColor: colors.secondary }]}>
      <Text style={{ color: colors.foreground, lineHeight: 19 }}>Restore {p.label}? {p.action === "snapshot" ? "Only missing or deleted records are added back. Active data is not overwritten." : "The record returns to active data."}</Text>
      <View style={styles.rowGap}>
        <Pressable testID="confirm-restore" accessibilityRole="button" disabled={working} onPress={() => void restore(p)} style={[btn(true, working), { flex: 1 }]}><Text style={{ color: colors.primaryForeground, fontWeight: "800" }}>{working ? "Restoring..." : "Confirm restore"}</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={working} onPress={() => setPending(null)} style={[btn(false, working), { flex: 1 }]}><Text style={{ color: colors.foreground, fontWeight: "700" }}>Cancel</Text></Pressable>
      </View>
    </View>
  ) : null;

  const isAdmin = data?.role === "admin";
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.screen}>
      <Pressable accessibilityRole="button" onPress={() => (router.canGoBack() ? router.back() : router.replace(isAdmin ? "/admin-dashboard" : "/settings"))}><Text style={{ color: colors.primary, fontWeight: "700" }}>Back</Text></Pressable>
      <Text style={[styles.eyebrow, { color: colors.primary }]}>UBUNTUSAFE</Text>
      <Text style={[styles.title, { color: colors.foreground }]}>Backups and restore</Text>
      {error ? <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{error}</Text> : null}
      {success ? <Text accessibilityLiveRegion="polite" style={{ color: colors.primary, fontWeight: "700" }}>{success}</Text> : null}
      {loading && !data ? <ActivityIndicator color={colors.primary} /> : !data ? (
        <Pressable accessibilityRole="button" onPress={() => void load()} style={btn(false, false)}><Text style={{ color: colors.primary, fontWeight: "700" }}>Try again</Text></Pressable>
      ) : <>
        <View style={card}>
          <Text style={[styles.h, { color: colors.foreground }]}>Status</Text>
          <Text style={{ color: data.enabled && data.ready ? colors.primary : colors.destructive, fontWeight: "800" }}>{!data.enabled ? "Automatic backups disabled" : data.ready ? "Encryption configured" : "Setup required"}</Text>
          <Text style={[styles.p, { color: colors.mutedForeground }]}>{data.message}</Text>
          <Text style={[styles.p, { color: colors.mutedForeground }]}>Automatic backups every {data.scheduleHours} hours while the API is running. Kept for {data.retentionDays} days.</Text>
          <Text style={[styles.p, { color: colors.mutedForeground }]}>Only code belongs on GitHub. Encrypted database backups stay private. Copy backups off this computer so a disk loss does not take them too.</Text>
        </View>

        {isAdmin ? <View style={card}>
          <Text style={[styles.h, { color: colors.foreground }]}>Full database backups</Text>
          <Pressable testID="create-db-backup" accessibilityRole="button" disabled={working || !data.ready} onPress={() => void createDb()} style={btn(true, working || !data.ready)}><Text style={{ color: colors.primaryForeground, fontWeight: "800" }}>{working ? "Working..." : "Create encrypted backup now"}</Text></Pressable>
          {data.databaseBackups.length === 0 ? <Text style={{ color: colors.mutedForeground }}>No completed backups yet.</Text> : data.databaseBackups.map((f) => (
            <View key={f.id} style={[styles.item, { borderColor: colors.border }]}><Text style={{ color: colors.foreground }}>{fmtDate(f.createdAt)}</Text><Text style={{ color: colors.mutedForeground }}>{fmtBytes(f.bytes)}</Text></View>
          ))}
          <Text style={[styles.p, { color: colors.mutedForeground }]}>Full system restore is done by the owner from the command line into a separate, EMPTY database. It never overwrites the live database. Verify the restored copy before switching the API to it.</Text>
        </View> : <View style={card}>
          <Text style={[styles.h, { color: colors.foreground }]}>My snapshots</Text>
          <Pressable testID="create-snapshot" accessibilityRole="button" disabled={working || !data.ready} onPress={() => void createSnap()} style={btn(true, working || !data.ready)}><Text style={{ color: colors.primaryForeground, fontWeight: "800" }}>{working ? "Working..." : "Create encrypted snapshot"}</Text></Pressable>
          {data.snapshots.length === 0 ? <Text style={{ color: colors.mutedForeground }}>No snapshots yet.</Text> : data.snapshots.map((f) => {
            const p = { action: "snapshot" as const, id: f.id, label: `the snapshot from ${fmtDate(f.createdAt)}` };
            return <View key={f.id} style={[styles.item, { borderColor: colors.border }]}>
              <View style={styles.between}><View><Text style={{ color: colors.foreground }}>{fmtDate(f.createdAt)}</Text><Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{fmtBytes(f.bytes)}</Text></View>
                <Pressable accessibilityRole="button" disabled={working} onPress={() => { setSuccess(""); setPending(p); }}><Text style={{ color: colors.primary, fontWeight: "800" }}>Restore missing</Text></Pressable></View>
              {confirmBox(p)}
            </View>;
          })}
        </View>}

        <View style={card}>
          <Text style={[styles.h, { color: colors.foreground }]}>Deleted records</Text>
          {data.deleted.length === 0 ? <Text style={{ color: colors.mutedForeground }}>Nothing deleted to restore.</Text> : data.deleted.map((d) => {
            const p = { action: "record" as const, id: d.id, kind: d.kind, label: `"${d.title}"` };
            return <View key={`${d.kind}-${d.id}`} style={[styles.item, { borderColor: colors.border }]}>
              <View style={styles.between}><View style={{ flex: 1 }}><Text style={{ color: colors.foreground, fontWeight: "700" }} numberOfLines={2}>{d.title}</Text><Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{d.kind} - deleted {fmtDate(d.deletedAt)}</Text></View>
                <Pressable accessibilityRole="button" disabled={working} onPress={() => { setSuccess(""); setPending(p); }}><Text style={{ color: colors.primary, fontWeight: "800" }}>Restore</Text></Pressable></View>
              {confirmBox(p)}
            </View>;
          })}
        </View>
        <Pressable accessibilityRole="button" disabled={loading} onPress={() => void load()} style={btn(false, loading)}><Text style={{ color: colors.primary, fontWeight: "700" }}>{loading ? "Refreshing..." : "Refresh"}</Text></Pressable>
      </>}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  screen: { padding: 20, paddingTop: 54, gap: 14, paddingBottom: 40 },
  eyebrow: { fontWeight: "800", letterSpacing: 2 },
  title: { fontSize: 29, fontWeight: "800" },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  h: { fontSize: 17, fontWeight: "800" },
  p: { lineHeight: 19, fontSize: 13 },
  action: { minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  item: { borderTopWidth: 1, paddingTop: 10, gap: 8 },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  confirm: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 10 },
  rowGap: { flexDirection: "row", gap: 8 },
});
