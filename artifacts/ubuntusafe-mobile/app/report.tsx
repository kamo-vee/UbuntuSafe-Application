import { useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useApp } from "@/context/AppContext";
import { goBackOrReplace } from "@/lib/navigation";
import { apiRequest } from "@/lib/api";
import { queueSync } from "@/lib/localDb";
import * as Crypto from "expo-crypto";

const categories = ["scam", "unsafe-job", "suspicious-link", "other"] as const;
export default function ReportScreen() {
  const router = useRouter();
  const { colors, user, addLocalActivity } = useApp();
  const [category, setCategory] = useState<(typeof categories)[number]>("scam");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!user || details.trim().length < 3)
      return Alert.alert(
        "Add details",
        "Describe what happened so the community can review it.",
      );
    setBusy(true);
    const id = Crypto.randomUUID();
    const now = new Date().toISOString();
    const payload = {
      id,
      userId: user.id,
      category,
      details: details.trim(),
      status: "received",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await addLocalActivity({
      id,
      title: "Report saved",
      detail: "Pending sync",
      status: "pending",
    });
    try {
      await apiRequest("/reports", {
        method: "POST",
        body: JSON.stringify({
          category,
          details: details.trim(),
          clientId: id,
        }),
      });
      Alert.alert(
        "Report received",
        "Thank you for helping keep the community safer.",
        [{ text: "Done", onPress: () => goBackOrReplace(router, "/community") }],
      );
    } catch {
      await queueSync("report", id, "upsert", payload);
      Alert.alert(
        "Saved offline",
        "Your report will upload when you reconnect.",
        [{ text: "Done", onPress: () => goBackOrReplace(router, "/community") }],
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>
        Report a scam
      </Text>
      <Text style={{ color: colors.mutedForeground }}>
        Do not include passwords, PINs, or full identity numbers.
      </Text>
      <View style={styles.categories}>
        {categories.map((item) => (
          <Pressable
            key={item}
            onPress={() => setCategory(item)}
            style={[
              styles.chip,
              {
                backgroundColor:
                  item === category ? colors.primary : colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            <Text
              style={{
                color:
                  item === category
                    ? colors.primaryForeground
                    : colors.foreground,
              }}
            >
              {item}
            </Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        multiline
        value={details}
        onChangeText={setDetails}
        placeholder="What happened?"
        placeholderTextColor={colors.mutedForeground}
        style={[
          styles.input,
          {
            color: colors.foreground,
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
      />
      <Pressable
        disabled={busy}
        onPress={() => void submit()}
        style={[styles.button, { backgroundColor: colors.primary }]}
      >
        <Text style={{ color: colors.primaryForeground, fontWeight: "800" }}>
          {busy ? "Saving..." : "Submit report"}
        </Text>
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, padding: 22, paddingTop: 70 },
  title: { fontSize: 30, fontWeight: "800", marginBottom: 8 },
  categories: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 25 },
  chip: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  input: {
    minHeight: 190,
    borderWidth: 1,
    borderRadius: 16,
    padding: 15,
    marginTop: 22,
    textAlignVertical: "top",
    fontSize: 16,
  },
  button: {
    height: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
  },
});
