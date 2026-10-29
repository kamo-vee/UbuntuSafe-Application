import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Text, View } from "react-native";
import { useApp } from "@/context/AppContext";
import { weeklyUsage } from "@/lib/weekly-usage";

export function WeeklyScanSummary({ revision = 0 }: { revision?: number }) {
  const { colors, user } = useApp();
  const [data, setData] = useState<Awaited<ReturnType<typeof weeklyUsage>> | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    setData(null);
    if (user) void weeklyUsage(user.id).then(result => { if (active) setData(result); }).catch(() => undefined);
    return () => { active = false; };
  }, [user?.id, revision]));
  if (!data) return null;
  return <View testID="weekly-scan-summary" style={{ padding: 14, gap: 7, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: colors.card }}>
    <Text style={{ color: colors.foreground, fontWeight: "800" }}>{data.total} {data.total === 1 ? "scan" : "scans"} this week</Text>
    <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Monday–Sunday · South Africa{!data.connected ? " · This device only" : data.pending ? " · Includes pending sync" : ""}</Text>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
      {data.tools.map(item => <Text key={item.tool} style={{ color: colors.foreground, fontSize: 13 }}>{item.label}: {item.count}</Text>)}
    </View>
  </View>;
}
