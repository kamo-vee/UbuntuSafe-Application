import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { AdminAnalytics } from "@workspace/api-client-react";
import { useApp } from "@/context/AppContext";
import { toolLabel } from "@/components/AdminCharts";

type Tab = "scans" | "reports" | "feedback" | "usage";
const PAGE = 25;
const when = (d: string) => new Date(d).toLocaleString();

export function AdminRecords({ data }: { data: AdminAnalytics }) {
  const { colors } = useApp();
  const [tab, setTab] = useState<Tab>("scans");
  const [limit, setLimit] = useState(PAGE);
  const tabs: { key: Tab; label: string; n: number }[] = [
    { key: "scans", label: "Scans", n: data.scanRecords.length },
    { key: "reports", label: "Reports", n: data.reports.length },
    { key: "feedback", label: "Feedback", n: data.feedback.length },
    { key: "usage", label: "Usage", n: data.userTools.length },
  ];
  const rows: { id: string; head: string; meta: string; body?: string }[] =
    tab === "scans" ? data.scanRecords.map(r => ({ id: r.id, head: `${toolLabel(r.tool)} · ${r.status}`, meta: `${r.fullName} · ${r.email} · ${when(r.createdAt)}`, body: r.title }))
    : tab === "reports" ? data.reports.map(r => ({ id: r.id, head: `${r.category} · ${r.status}`, meta: `${r.fullName} · ${r.email} · ${when(r.createdAt)}`, body: r.details }))
    : tab === "feedback" ? data.feedback.map(r => ({ id: r.id, head: r.fullName, meta: `${r.email} · ${when(r.createdAt)}`, body: r.message }))
    : data.userTools.map((r, i) => ({ id: `${r.userId}-${r.tool}-${i}`, head: `${r.fullName} ${r.surname} · ${toolLabel(r.tool)}: ${r.count}`, meta: `${r.email} · last ${when(r.lastUsedAt)}` }));
  return (
    <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={s.tabs} accessibilityRole="tablist">
        {tabs.map(t => {
          const on = t.key === tab;
          return (
            <Pressable key={t.key} testID={`tab-${t.key}`} accessibilityRole="tab" accessibilityState={{ selected: on }}
              onPress={() => { setTab(t.key); setLimit(PAGE); }}
              style={[s.tab, { backgroundColor: on ? colors.primary : colors.secondary }]}>
              <Text style={{ color: on ? colors.primaryForeground : colors.secondaryForeground, fontWeight: "700", fontSize: 13 }}>{t.label} {t.n}</Text>
            </Pressable>
          );
        })}
      </View>
      {tab === "usage" ? <Text style={[s.note, { color: colors.mutedForeground }]}>This week</Text> : <Text style={[s.note, { color: colors.mutedForeground }]}>Most recent first</Text>}
      {rows.length === 0 ? <Text style={{ color: colors.mutedForeground, paddingVertical: 12 }}>Nothing here yet.</Text> :
        rows.slice(0, limit).map(r => (
          <View key={r.id} style={[s.row, { borderBottomColor: colors.border }]}>
            <Text style={{ color: colors.foreground, fontWeight: "700" }}>{r.head}</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{r.meta}</Text>
            {r.body ? <Text style={{ color: colors.foreground, fontSize: 13 }} numberOfLines={3}>{r.body}</Text> : null}
          </View>
        ))}
      {rows.length > limit ? (
        <Pressable accessibilityRole="button" onPress={() => setLimit(l => l + PAGE)} style={[s.more, { borderColor: colors.border }]}>
          <Text style={{ color: colors.primary, fontWeight: "700" }}>Show more ({rows.length - limit} left)</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tab: { borderRadius: 999, paddingHorizontal: 12, minHeight: 36, justifyContent: "center" },
  note: { fontSize: 12 },
  row: { paddingVertical: 9, borderBottomWidth: 1, gap: 2 },
  more: { minHeight: 42, borderWidth: 1, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 6 },
});
