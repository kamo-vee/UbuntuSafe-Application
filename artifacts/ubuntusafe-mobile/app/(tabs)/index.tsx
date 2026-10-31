import { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useApp } from "@/context/AppContext";
import { BrandLogo } from "@/components/BrandLogo";
import { clearScansForUser, listScans } from "@/lib/localDb";
import { syncNow } from "@/lib/sync";

export default function DashboardScreen() {
  const router = useRouter();
  const {
    colors,
    user,
    hydrated,
    localActivities,
    clearLocalActivities,
    t,
  } = useApp();
  const [scans, setScans] = useState<Awaited<ReturnType<typeof listScans>>>([]);
  const [clearing, setClearing] = useState(false);
  useFocusEffect(useCallback(() => {
    if (!hydrated || !user) return;
    let active = true;
    let refreshing = false;
    const load = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const local = await listScans(user.id);
        if (active) setScans(local);
        try {
          await syncNow();
        } catch {
          /* local-first dashboard remains available */
        }
        const updated = await listScans(user.id);
        if (active) setScans(updated);
      } catch {
        console.warn("Dashboard records could not be refreshed.");
      } finally {
        refreshing = false;
      }
    };
    void load();
    const timer = setInterval(() => void load(), 60000);
    return () => { active = false; clearInterval(timer); };
  }, [user?.id, hydrated]));
  if (!hydrated || !user) return null;
  const monday = new Date(Date.now() + 2 * 3600000);
  monday.setUTCHours(0, 0, 0, 0);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const weekStart = monday.getTime() - 2 * 3600000;
  const week = scans.filter(scan => Date.parse(scan.createdAt) >= weekStart && Date.parse(scan.createdAt) < weekStart + 7 * 86400000);
  const safe = week.filter((scan) => scan.status === "safe").length;
  const activities = [
    ...localActivities,
    ...scans.map((scan) => ({
      id: scan.id,
      title: scan.title,
      detail: scan.detail,
      status: scan.status,
    })),
  ]
    .filter(
      (item, index, all) =>
        all.findIndex((other) => other.id === item.id) === index,
    )
    .slice(0, 5);
  const clearRecent = () => {
    Alert.alert(t("clearActivity"), t("clearActivityConfirm"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("clearActivity"),
        style: "destructive",
        onPress: async () => {
          if (!user || clearing) return;
          setClearing(true);
          try {
            await clearScansForUser(user.id);
            clearLocalActivities();
            try {
              await syncNow();
            } catch {
              // The local tombstones sync automatically when the API is reachable.
            }
            setScans(await listScans(user.id));
            Alert.alert(t("clearActivity"), t("clearedActivity"));
          } catch (error) {
            Alert.alert(
              "Could not clear activity",
              error instanceof Error ? error.message : "Please try again.",
            );
          } finally {
            setClearing(false);
          }
        },
      },
    ]);
  };
  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
    >
      <BrandLogo iconSize={34} textSize={19} />
      <Text style={[styles.title, { color: colors.foreground }]}>
        {t("welcomeName").replace("{name}", user.fullName)}
      </Text>
      <View style={styles.grid}>
        {[
          [
            t("safeRate"),
            `${week.length ? Math.round((safe / week.length) * 100) : 100}%`,
          ],
          [
            t("scamsCaught"),
            week.filter((scan) => scan.status !== "safe").length,
          ],
          [
            t("jobsVerified"),
            week.filter((scan) => scan.kind === "job" && scan.status === "safe")
              .length,
          ],
          ["Weekly scan", week.length],
        ].map(([label, value]) => (
          <View
            key={String(label)}
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.row}>
              <Text style={[styles.value, { color: colors.primary }]}>
                {value}
              </Text>
              {label === "Weekly scan" ? <Feather name="calendar" size={20} color={colors.primary} /> : null}
            </View>
            <Text style={{ color: colors.mutedForeground }}>{label}</Text>
          </View>
        ))}
      </View>
      <Text style={[styles.section, { color: colors.foreground }]}>
        {t("protectionTools")}
      </Text>
      <View style={styles.tools}>
        {(["message", "link", "job", "voice"] as const).map((kind) => (
          <Pressable
            key={kind}
            onPress={() => router.push({ pathname: "/tool", params: { kind } })}
            style={[
              styles.tool,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Feather
              name={
                kind === "message"
                  ? "message-square"
                  : kind === "link"
                    ? "link"
                    : kind === "job"
                      ? "briefcase"
                      : "mic"
              }
              size={20}
              color={colors.primary}
            />
            <Text style={{ color: colors.foreground, fontWeight: "700" }}>
              {kind === "job"
                ? t("jobScan")
                : kind === "message"
                  ? t("messageScan")
                  : kind === "link"
                    ? t("linkScan")
                    : t("voiceScan")}
            </Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() => router.push({ pathname: "/tool", params: { kind: "screen" } })}
          style={[
            styles.tool,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Feather name="monitor" size={20} color={colors.primary} />
          <Text style={{ color: colors.foreground, fontWeight: "700" }}>
            {t("screenScan")}
          </Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        <Text style={[styles.section, { color: colors.foreground }]}>
      {t("recentActivity")}
        </Text>
        <View style={styles.activityActions}>
          {activities.length > 0 && (
            <Pressable disabled={clearing} onPress={clearRecent}>
              <Text style={{ color: colors.destructive }}>
                {clearing ? "…" : t("clearActivity")}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
      {activities.map((item) => (
        <View
          key={item.id}
          style={[
            styles.activity,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Feather
            name={item.status === "safe" ? "check-circle" : "alert-triangle"}
            size={18}
            color={item.status === "safe" ? "#15965B" : colors.destructive}
          />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.foreground, fontWeight: "700" }}>
              {item.title}
            </Text>
            <Text style={{ color: colors.mutedForeground }}>{item.detail}</Text>
          </View>
        </View>
      ))}
      <Pressable
        onPress={() => router.push("/report")}
        style={[styles.report, { backgroundColor: colors.primary }]}
      >
        <Text style={{ color: colors.primaryForeground, fontWeight: "800" }}>
          Report a scam
        </Text>
      </Pressable>
      <Pressable onPress={() => router.push("/feedback")} style={[styles.report, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
        <Text style={{ color: colors.foreground, fontWeight: "800" }}>Community feedback</Text>
      </Pressable>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  content: { padding: 22, paddingTop: 56, paddingBottom: 120 },
  title: { fontSize: 29, fontWeight: "800", marginTop: 28, marginBottom: 22 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  card: {
    width: "48%",
    minHeight: 92,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    justifyContent: "center",
  },
  value: { fontSize: 25, fontWeight: "800", marginBottom: 4 },
  section: { fontSize: 18, fontWeight: "800", marginTop: 28, marginBottom: 12 },
  tools: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tool: {
    width: "48%",
    minHeight: 70,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    gap: 10,
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  activityActions: { flexDirection: "row", alignItems: "center", gap: 14 },
  activity: {
    minHeight: 64,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  report: {
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
});
