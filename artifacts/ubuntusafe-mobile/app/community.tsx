import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useApp } from "@/context/AppContext";
import { apiRequest } from "@/lib/api";
import { listOutbox } from "@/lib/localDb";
import { scanOffline } from "@/lib/scanner";

type ReportRow = {
  id: string;
  fullName: string;
  email: string;
  category: string;
  result: "safe" | "warning" | "danger";
  createdAt: string;
};

const resultColors = {
  safe: "#15965B",
  warning: "#BA7900",
  danger: "#C73B35",
};

export default function CommunityScreen() {
  const router = useRouter();
  const { admin } = useLocalSearchParams<{ admin?: string }>();
  const { colors, t, user } = useApp();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const emailSelectedReport = async () => {
    if (!selectedReportId || admin !== "1" || sending) return;
    setSending(true);
    try {
      await apiRequest("/admin/reports/email", { method: "POST", body: JSON.stringify({ reportId: selectedReportId }) });
      Alert.alert("Report emailed", "The selected report was sent to its user.");
      setSelectedReportId(null);
    } catch (cause) {
      Alert.alert("Could not email report", cause instanceof Error ? cause.message : "Check SMTP setup and try again.");
    } finally { setSending(false); }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      setReports(await apiRequest<ReportRow[]>("/reports"));
    } catch (cause) {
      const outbox = (await listOutbox().catch(() => [])) as Array<{
        entity: "scan" | "report";
        payload: string;
      }>;
      const localRows = outbox
        .filter((item) => item.entity === "report")
        .map((item) => {
          const payload = JSON.parse(item.payload) as {
            id: string;
            category: string;
            details: string;
            createdAt: string;
            userId: string;
          };
          if (user && payload.userId !== user.id) return null;
          const kind =
            payload.category === "unsafe-job"
              ? "job"
              : payload.category === "suspicious-link"
                ? "link"
                : "message";
          let result: ReportRow["result"] = "warning";
          try {
            result = scanOffline(kind, payload.details).status;
          } catch {
            // A report can lack enough context for a definitive type-specific scan.
          }
          return {
            id: payload.id,
            fullName: user?.fullName ?? "",
            email: user?.email ?? "",
            category: payload.category,
            result,
            createdAt: payload.createdAt,
          };
        })
        .filter((item): item is ReportRow => Boolean(item));
      setReports(localRows);
      if (localRows.length) setNotice("Offline — showing reports saved on this device.");
      else
        setError(
          cause instanceof Error
            ? cause.message
            : "Community reports are unavailable while offline.",
        );
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.fullName, user?.email]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.topRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={[styles.back, { borderColor: colors.border }]}
        >
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>
          {t("communityReports")}
        </Text>
      </View>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        {t("myReports")}
      </Text>
      <Pressable
        onPress={() => router.push("/report")}
        style={[styles.submit, { backgroundColor: colors.primary }]}
      >
        <Text style={{ color: colors.primaryForeground, fontWeight: "800" }}>
          {t("reportScam")}
        </Text>
      </Pressable>
      {admin === "1" && selectedReportId ? <Pressable disabled={sending} onPress={() => void emailSelectedReport()} style={[styles.submit, { backgroundColor: colors.secondary }]}><Text style={{ color: colors.foreground, fontWeight: "800" }}>{sending ? "Sending..." : "Email selected report to user"}</Text></Pressable> : null}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ color: colors.mutedForeground, marginTop: 10 }}>
            {t("loading")}
          </Text>
        </View>
      ) : error ? (
        <View
          style={[
            styles.messageCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={{ color: colors.mutedForeground }}>{error}</Text>
          <Pressable onPress={() => void load()} style={{ paddingTop: 12 }}>
            <Text style={{ color: colors.primary, fontWeight: "700" }}>
              {t("retrySync")}
            </Text>
          </Pressable>
        </View>
      ) : reports.length === 0 ? (
        <View
          style={[
            styles.messageCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={{ color: colors.mutedForeground }}>{t("noReports")}</Text>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {notice && (
            <Text style={[styles.notice, { color: colors.mutedForeground }]}>
              {notice}
            </Text>
          )}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator
            style={styles.tableScroll}
          >
            <View>
            <View
              style={[
                styles.tableRow,
                styles.tableHeader,
                { backgroundColor: colors.secondary },
              ]}
            >
              <Text style={[styles.cell, styles.headerCell, { color: colors.foreground }]}>
                {t("reportName")}
              </Text>
              <Text style={[styles.cell, styles.headerCell, { color: colors.foreground }]}>
                {t("reportEmail")}
              </Text>
              <Text style={[styles.cell, styles.headerCell, { color: colors.foreground }]}>
                {t("reportResult")}
              </Text>
              <Text style={[styles.cell, styles.headerCell, { color: colors.foreground }]}>
                {t("reportCategory")}
              </Text>
            </View>
            {reports.map((report) => (
              <Pressable
                key={report.id}
                onPress={() => admin === "1" ? setSelectedReportId(report.id) : undefined}
                style={[
                  styles.tableRow,
                  { borderBottomColor: colors.border, backgroundColor: selectedReportId === report.id ? colors.secondary : "transparent" },
                ]}
              >
                <Text style={[styles.cell, { color: colors.foreground }]}>
                  {report.fullName}
                </Text>
                <Text style={[styles.cell, { color: colors.mutedForeground }]}>
                  {report.email}
                </Text>
                <Text
                  style={[
                    styles.cell,
                    styles.result,
                    { color: resultColors[report.result] },
                  ]}
                >
                  {report.result.toUpperCase()}
                </Text>
                <Text style={[styles.cell, { color: colors.foreground }]}>
                  {report.category}
                </Text>
              </Pressable>
            ))}
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 20, paddingTop: 58 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  back: {
    width: 42,
    height: 42,
    borderWidth: 1,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { flex: 1, fontSize: 25, fontWeight: "800" },
  subtitle: { marginTop: 12, marginBottom: 14 },
  notice: { marginBottom: 10, fontSize: 12 },
  submit: {
    minHeight: 48,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  messageCard: { borderWidth: 1, borderRadius: 15, padding: 16 },
  tableScroll: { flex: 1 },
  tableRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
  },
  tableHeader: { minHeight: 48, borderRadius: 10, borderBottomWidth: 0 },
  cell: { width: 190, paddingHorizontal: 12, fontSize: 13 },
  headerCell: { fontWeight: "800" },
  result: { fontWeight: "800" },
});
