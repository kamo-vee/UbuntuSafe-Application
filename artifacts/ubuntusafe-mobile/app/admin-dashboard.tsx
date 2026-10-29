import { useCallback, useState } from "react";
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Redirect, useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getGetAdminAnalyticsQueryKey, useEmailAdminReport, useGetAdminAnalytics } from "@workspace/api-client-react";
import { useApp } from "@/context/AppContext";
import { AdminBackupSummary } from "@/components/AdminBackupSummary";
import { ColumnChart, TOOL_CODES, UsageDiagram, toolLabel } from "@/components/AdminCharts";
import { AdminCreateAccount } from "@/components/AdminCreateAccount";
import { AdminRecords } from "@/components/AdminRecords";
import { downloadAdminReport, errorMessage } from "@/lib/admin-export";
import { apiRequest } from "@/lib/api";

const DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const shortDate = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });

export default function AdminDashboardScreen() {
  const { colors } = useApp();
  const [access, setAccess] = useState<"checking" | "allowed" | "denied" | "error">("checking");
  const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    setAccess("checking");
    void apiRequest<{ role: string }>("/backup").then(result => {
      if (active) setAccess(result.role === "admin" ? "allowed" : "denied");
    }).catch((error: unknown) => {
      const status = (error as { status?: number })?.status;
      if (active) setAccess(status === 401 || status === 403 ? "denied" : "error");
    });
    return () => { active = false; };
  }, [retry]));
  if (access === "denied") return <Redirect href="/admin-sign-in" />;
  if (access !== "allowed") return <View style={{ flex: 1, backgroundColor: colors.background, padding: 24, justifyContent: "center", gap: 16 }}>
    <Text accessibilityRole="alert" style={{ color: colors.foreground }}>{access === "checking" ? "Checking administrator access..." : "Could not verify administrator access. Check your connection."}</Text>
    {access === "error" ? <Pressable accessibilityRole="button" onPress={() => setRetry(value => value + 1)} style={{ minHeight: 44, justifyContent: "center" }}>
      <Text style={{ color: colors.primary, fontWeight: "700" }}>Retry</Text>
    </Pressable> : null}
  </View>;
  return <AuthorizedAdminDashboard />;
}

function AuthorizedAdminDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, signOut } = useApp();
  const q = useGetAdminAnalytics({ query: { queryKey: getGetAdminAnalyticsQueryKey(), staleTime: 30000, refetchOnWindowFocus: true, refetchInterval: 120000 } });
  const email = useEmailAdminReport();
  const [loggingOut, setLoggingOut] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try { await signOut(); router.replace("/user-access"); }
    catch (e) { setNotice({ ok: false, text: errorMessage(e, "Could not log out.") }); setLoggingOut(false); }
  };
  const download = async () => {
    setDownloading(true); setNotice(null);
    try { const n = await downloadAdminReport(); setNotice({ ok: true, text: `Report ready: ${n}` }); }
    catch (e) { setNotice({ ok: false, text: errorMessage(e, "Download failed.") }); }
    finally { setDownloading(false); }
  };
  const sendEmail = () => {
    setNotice(null);
    email.mutate(undefined, {
      onSuccess: r => setNotice({ ok: r.accepted, text: r.accepted ? `Accepted for sending to ${r.recipient}. Delivery is not guaranteed.` : r.message }),
      onError: e => setNotice({ ok: false, text: errorMessage(e, "Email request failed.") }),
    });
  };

  const d = q.data;
  const toolData = TOOL_CODES.map(t => ({ label: toolLabel(t), value: d?.tools.find(x => x.tool === t)?.count ?? 0 }));
  const dailyData = (d?.daily ?? []).map((x, i) => ({ label: d!.daily.length === 7 ? DAY[i] : shortDate(x.date), value: x.count }));
  const top = Platform.OS === "web" ? 67 : insets.top + 12;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[s.screen, { paddingTop: top, paddingBottom: insets.bottom + 34 }]}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.primary} />}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: colors.foreground }]}>Admin</Text>
          {d ? <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Week {shortDate(d.weekStart)} – {shortDate(new Date(Date.parse(d.weekEnd) - 1).toISOString())} · South Africa</Text> : null}
        </View>
        <Pressable testID="button-logout" accessibilityRole="button" disabled={loggingOut} onPress={() => void logout()}
          style={[s.logout, { borderColor: colors.destructive, opacity: loggingOut ? 0.6 : 1 }]}>
          <Text style={{ color: colors.destructive, fontWeight: "800" }}>{loggingOut ? "Signing out..." : "Log out"}</Text>
        </Pressable>
      </View>

      <View style={s.navRow}>
        <Pressable onPress={() => router.push({ pathname: "/community", params: { admin: "1" } })} style={[s.chip, { backgroundColor: colors.secondary }]}>
          <Text style={{ color: colors.secondaryForeground, fontWeight: "700" }}>Community reports</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/community-feedback")} style={[s.chip, { backgroundColor: colors.secondary }]}>
          <Text style={{ color: colors.secondaryForeground, fontWeight: "700" }}>Community feedback</Text>
        </Pressable>
      </View>

      {q.isLoading ? (
        <View style={s.grid}>{[0, 1, 2, 3].map(i => <View key={i} style={[s.stat, s.skel, { backgroundColor: colors.secondary }]} />)}</View>
      ) : q.error ? (
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.destructive }]}>
          <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{errorMessage(q.error, "Could not load dashboard.")}</Text>
          <Pressable onPress={() => void q.refetch()} style={[s.btn, { backgroundColor: colors.primary }]}>
            <Text style={{ color: colors.primaryForeground, fontWeight: "800" }}>Retry</Text>
          </Pressable>
        </View>
      ) : d ? <>
        <View style={s.grid}>
          {([["Users", d.totals.users], ["Active this week", d.totals.activeUsers], ["Scans this week", d.totals.scans], ["Reports", d.totals.reports], ["Feedback", d.totals.feedback]] as const).map(([l, n]) => (
            <View key={l} style={[s.stat, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[s.statN, { color: colors.primary }]}>{n.toLocaleString()}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, fontWeight: "600" }}>{l}</Text>
            </View>
          ))}
        </View>
        <ColumnChart testID="chart-tools" title="Tool uses this week" data={toolData} />
        <ColumnChart testID="chart-daily" title="Uses per day" data={dailyData} />
        <UsageDiagram rows={d.userTools} />
        <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Updated {new Date(d.generatedAt).toLocaleString()}</Text>
      </> : null}

      <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[s.h2, { color: colors.foreground }]}>Report</Text>
        <View style={s.navRow}>
          <Pressable testID="button-download-report" accessibilityRole="button" disabled={downloading} onPress={() => void download()}
            style={[s.btn, { backgroundColor: colors.primary, opacity: downloading ? 0.6 : 1 }]}>
            <Text style={{ color: colors.primaryForeground, fontWeight: "800" }}>{downloading ? "Preparing..." : "Download CSV"}</Text>
          </Pressable>
          <Pressable testID="button-email-report" accessibilityRole="button" disabled={email.isPending} onPress={sendEmail}
            style={[s.btn, { borderWidth: 1, borderColor: colors.border, opacity: email.isPending ? 0.6 : 1 }]}>
            <Text style={{ color: colors.foreground, fontWeight: "700" }}>{email.isPending ? "Requesting..." : `Request email${d?.adminEmail ? ` to ${d.adminEmail}` : ""}`}</Text>
          </Pressable>
        </View>
        {notice ? <Text accessibilityRole="alert" style={{ color: notice.ok ? colors.primary : colors.destructive }}>{notice.text}</Text> : null}
      </View>

      <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Latest 500 records per section. CSV includes all active records. Older screenshot checks remain in Message totals.</Text>
      {d ? <AdminRecords data={d} /> : null}
      <AdminBackupSummary />
      <AdminCreateAccount />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { paddingHorizontal: 18, gap: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { fontSize: 28, fontWeight: "800" },
  h2: { fontSize: 17, fontWeight: "800" },
  logout: { borderWidth: 1.5, borderRadius: 12, minHeight: 42, paddingHorizontal: 14, justifyContent: "center" },
  navRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderRadius: 12, minHeight: 42, paddingHorizontal: 14, justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stat: { flexGrow: 1, flexBasis: "30%", minWidth: 100, borderWidth: 1, borderRadius: 14, padding: 12, gap: 2 },
  skel: { height: 70, borderWidth: 0 },
  statN: { fontSize: 24, fontWeight: "800" },
  card: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 10 },
  btn: { minHeight: 46, borderRadius: 12, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
});
