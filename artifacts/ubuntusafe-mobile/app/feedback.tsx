import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { useApp } from "@/context/AppContext";
import { apiRequest } from "@/lib/api";

export default function FeedbackScreen() {
  const router = useRouter(); const { colors } = useApp();
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const submit = async () => {
    const clean = message.trim();
    if (clean.length < 5) return setError("Please enter at least five characters.");
    setBusy(true); setError("");
    try {
      await apiRequest("/feedback", { method: "POST", body: JSON.stringify({ message: clean }) });
      Alert.alert("Feedback received", "Thank you. Your feedback was saved for the UbuntuSafe team.");
      setMessage(""); router.back();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not send feedback."); }
    finally { setBusy(false); }
  };
  return <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.screen}>
    <Text style={[styles.title, { color: colors.foreground }]}>Community feedback</Text>
    <Text style={{ color: colors.mutedForeground, lineHeight: 22 }}>Tell us what is working or what should be improved. Administrators can review submitted feedback.</Text>
    <TextInput multiline maxLength={3000} textAlignVertical="top" value={message} onChangeText={setMessage} placeholder="Write your feedback" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]} />
    {error ? <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{error}</Text> : null}
    <Pressable disabled={busy} onPress={() => void submit()} style={[styles.button, { backgroundColor: colors.primary }]}><Text style={{ color: colors.primaryForeground, fontWeight: "800" }}>{busy ? "Sending..." : "Send feedback"}</Text></Pressable>
  </ScrollView>;
}
const styles = StyleSheet.create({ screen: { flexGrow: 1, padding: 24, paddingTop: 58, gap: 16 }, title: { fontSize: 29, fontWeight: "800" }, input: { minHeight: 180, borderWidth: 1, borderRadius: 14, padding: 14 }, button: { minHeight: 52, borderRadius: 13, alignItems: "center", justifyContent: "center" } });
