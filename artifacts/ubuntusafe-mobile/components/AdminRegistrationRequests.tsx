import { useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAdministratorAccountsQueryKey, getGetAdministratorRegistrationRequestsQueryKey,
  useGetAdministratorRegistrationRequests, useReviewAdministratorRegistration,
  type AdministratorAccount,
} from "@workspace/api-client-react";
import { useApp } from "@/context/AppContext";
import { errorMessage } from "@/lib/admin-export";

type Decision = "approve" | "reject";

function confirmAction(title: string, body: string, label: string): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(typeof window !== "undefined" && window.confirm(`${title}\n\n${body}`));
  return new Promise(res => Alert.alert(title, body, [
    { text: "Cancel", style: "cancel", onPress: () => res(false) },
    { text: label, style: "destructive", onPress: () => res(true) },
  ], { cancelable: true, onDismiss: () => res(false) }));
}

export function AdminRegistrationRequests() {
  const { colors } = useApp();
  const qc = useQueryClient();
  const q = useGetAdministratorRegistrationRequests({
    query: { queryKey: getGetAdministratorRegistrationRequestsQueryKey(), staleTime: 20000, refetchInterval: 45000, refetchOnWindowFocus: true },
  });
  const review = useReviewAdministratorRegistration();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: getGetAdministratorRegistrationRequestsQueryKey() }),
    qc.invalidateQueries({ queryKey: getGetAdministratorAccountsQueryKey() }),
  ]);

  const act = async (r: AdministratorAccount, decision: Decision) => {
    if (busyId) return;
    const who = `${r.fullName} ${r.surname} (${r.email})`;
    const ok = await confirmAction(
      decision === "approve" ? "Approve administrator?" : "Reject request?",
      decision === "approve"
        ? `${who} will get full administrator access: all user records, reports, feedback, exports, backups and adding administrators.`
        : `${who} will not be able to sign in as an administrator.`,
      decision === "approve" ? "Approve" : "Reject",
    );
    if (!ok) return;
    setBusyId(r.id); setNotice(null);
    try {
      await review.mutateAsync({ id: r.id, data: { decision } });
      setNotice({ ok: true, text: `${r.email} ${decision === "approve" ? "approved" : "rejected"}.` });
    } catch (e) {
      const conflict = (e as { status?: number } | null)?.status === 409;
      setNotice({ ok: false, text: conflict ? "Already reviewed in another session. List refreshed." : errorMessage(e, "Review failed.") });
    } finally {
      await refresh().catch(() => undefined);
      setBusyId(null);
    }
  };

  const all = q.data ?? [];
  const pending = all.filter(r => (r.approvalStatus ?? "pending") === "pending");
  const history = all.filter(r => r.approvalStatus === "approved" || r.approvalStatus === "rejected")
    .sort((a, b) => (b.reviewedAt ?? b.createdAt).localeCompare(a.reviewedAt ?? a.createdAt));

  return (
    <View testID="admin-registration-requests" style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={s.head}>
        <Text style={[s.title, { color: colors.foreground }]}>Administrator requests</Text>
        {pending.length ? <Text style={[s.count, { backgroundColor: colors.primary, color: colors.primaryForeground }]}>{pending.length}</Text> : null}
      </View>
      {notice ? <Text accessibilityRole="alert" style={{ color: notice.ok ? colors.primary : colors.destructive }}>{notice.text}</Text> : null}
      {q.isLoading ? <View style={{ gap: 8 }}>{[0, 1].map(i => <View key={i} style={[s.skel, { backgroundColor: colors.secondary }]} />)}</View>
        : q.error ? <View style={{ gap: 8 }}>
            <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{errorMessage(q.error, "Could not load requests.")}</Text>
            <Pressable accessibilityRole="button" onPress={() => void q.refetch()} style={[s.btn, { borderWidth: 1, borderColor: colors.border }]}>
              <Text style={{ color: colors.primary, fontWeight: "700" }}>Retry</Text>
            </Pressable>
          </View>
        : <>
          {pending.length === 0 ? <Text style={{ color: colors.mutedForeground }}>No pending requests.</Text> : pending.map(r => {
            const busy = busyId === r.id;
            return (
              <View key={r.id} testID={`request-${r.id}`} style={[s.row, { borderColor: colors.border }]}>
                <Text style={{ color: colors.foreground, fontWeight: "800" }}>{r.fullName} {r.surname}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{r.email} · requested {new Date(r.createdAt).toLocaleString()}</Text>
                <View style={s.actions}>
                  <Pressable testID={`button-approve-${r.id}`} accessibilityRole="button" accessibilityLabel={`Approve ${r.email}`} disabled={!!busyId}
                    onPress={() => void act(r, "approve")} style={[s.btn, { backgroundColor: colors.primary, opacity: busyId ? 0.55 : 1 }]}>
                    <Text style={{ color: colors.primaryForeground, fontWeight: "800" }}>{busy ? "Working..." : "Approve"}</Text>
                  </Pressable>
                  <Pressable testID={`button-reject-${r.id}`} accessibilityRole="button" accessibilityLabel={`Reject ${r.email}`} disabled={!!busyId}
                    onPress={() => void act(r, "reject")} style={[s.btn, { borderWidth: 1, borderColor: colors.destructive, opacity: busyId ? 0.55 : 1 }]}>
                    <Text style={{ color: colors.destructive, fontWeight: "800" }}>Reject</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
          {history.length ? <Text style={[s.sub, { color: colors.foreground }]}>Reviewed</Text> : null}
          {history.slice(0, 20).map(r => (
            <View key={r.id} style={[s.hist, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.foreground, fontWeight: "700" }}>{r.fullName} {r.surname}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{r.email}{r.reviewedAt ? ` · ${new Date(r.reviewedAt).toLocaleString()}` : ""}</Text>
              </View>
              <Text style={{ color: r.approvalStatus === "approved" ? colors.primary : colors.destructive, fontWeight: "800", fontSize: 12 }}>
                {r.approvalStatus === "approved" ? "Approved" : "Rejected"}
              </Text>
            </View>
          ))}
        </>}
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 10 },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 19, fontWeight: "800" },
  count: { minWidth: 24, textAlign: "center", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, fontWeight: "800", overflow: "hidden" },
  sub: { fontSize: 15, fontWeight: "800", marginTop: 6 },
  row: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  actions: { flexDirection: "row", gap: 8, marginTop: 6 },
  btn: { minHeight: 44, borderRadius: 11, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  hist: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderBottomWidth: 1 },
  skel: { height: 64, borderRadius: 12 },
});
