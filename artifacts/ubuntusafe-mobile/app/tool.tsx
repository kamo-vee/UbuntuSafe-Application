import { useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useApp } from "@/context/AppContext";
import { scanOffline, type ScanKind } from "@/lib/scanner";
import { apiRequest } from "@/lib/api";
import { queueSync, saveScan } from "@/lib/localDb";
import * as Crypto from "expo-crypto";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
} from "expo-audio";
import { WeeklyScanSummary } from "@/components/WeeklyScanSummary";
import { LogoutButton } from "@/components/LogoutButton";
import { weeklyUsage } from "@/lib/weekly-usage";

export default function ToolScreen() {
  const router = useRouter();
  const { kind = "message" } = useLocalSearchParams<{ kind?: string }>();
  const { colors, user, addLocalActivity, t } = useApp();
  const isScreenScan = kind === "screen";
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [scanRevision, setScanRevision] = useState(0);
  const [notice, setNotice] = useState<{
    title: string;
    message: string;
    onDone?: () => void;
  } | null>(null);
  const showNotice: typeof Alert.alert = (title, message, buttons) => {
    const action = buttons?.find((button) => button.onPress)?.onPress;
    setNotice({
      title,
      message: message ?? "",
      onDone: action ? () => action() : undefined,
    });
    if (Platform.OS !== "web") Alert.alert(title, message, buttons);
  };
  const scanKind = (
    ["message", "voice", "link", "job", "email"] as string[]
  ).includes(kind ?? "")
    ? (kind as ScanKind)
    : "message";
  const label = useMemo(
    () =>
      isScreenScan
        ? t("screenScan")
        :
      ({
        message: t("messageScan"),
        voice: t("voiceScan"),
        email: t("messageScan"),
        link: t("linkScan"),
        job: t("jobScan"),
      })[scanKind],
    [isScreenScan, scanKind, t],
  );
  const guidance = {
    message: t("welcomeMessage"),
    voice: t("welcomeTranscript"),
    email: t("welcomeMessage"),
    link: t("welcomeLink"),
    job: t("welcomeJob"),
  }[scanKind];
  const submit = async () => {
    setNotice(null);
    if (!user || content.trim().length < 3)
      return showNotice(
        "Add something to scan",
        "Enter at least 3 characters first.",
      );
    let verdict;
    try {
      verdict = scanOffline(scanKind, content.trim());
    } catch (error) {
      showNotice(
        "Content does not match this check",
        error instanceof Error ? error.message : "Choose the matching protection tool.",
      );
      return;
    }
    setBusy(true);
    const now = new Date().toISOString();
    const id = Crypto.randomUUID();
    const localScan = {
      id,
      userId: user.id,
      kind: scanKind,
      tool: isScreenScan ? "screen" : scanKind,
      content: content.trim(),
      status: verdict.status,
      title: verdict.title,
      detail: verdict.detail,
      createdAt: now,
      updatedAt: now,
      synced: 0 as const,
    };
    try {
      const remote = await apiRequest<{
        id: string;
        status: "safe" | "warning" | "danger";
        title: string;
        detail: string;
        riskScore: number;
        suspiciousIndicators: string[];
        recommendedActions: string[];
        analysisMode: "ai" | "rules";
        checkedAt: string;
      }>("/scan", {
        method: "POST",
        body: JSON.stringify({ kind: scanKind, tool: isScreenScan ? "screen" : scanKind, content: content.trim() }),
      });
      await saveScan({
        ...localScan,
        id: remote.id,
        status: remote.status,
        title: remote.title,
        detail: remote.detail,
        createdAt: remote.checkedAt,
        updatedAt: remote.checkedAt,
        synced: 1,
      });
      await addLocalActivity({
        id: remote.id,
        title: remote.title,
        detail: "Just now",
        status: remote.status,
      });
      setScanRevision(value => value + 1);
      const usage = await weeklyUsage(user.id);
      const resultDetail = remote.analysisMode === "rules"
        ? `${remote.detail}\n\nAI risk analysis is not configured; this result uses local rules.`
        : remote.detail;
      const report = [
        resultDetail,
        `Heuristic risk score: ${remote.riskScore}/100 (not a probability)`,
        `Suspicious indicators: ${remote.suspiciousIndicators.length ? remote.suspiciousIndicators.join(", ") : "No common indicators found."}`,
        `Recommended actions: ${remote.recommendedActions.join(" ")}`,
        `This week: ${usage.total} completed scans across all tools. ${label}: ${usage.tools.find(item => item.tool === (isScreenScan ? "screen" : scanKind))?.count ?? 0}.${!usage.connected ? " Count is based on this device." : ""}`,
      ].join("\n\n");
      showNotice(remote.title, report, [
        { text: "Done", onPress: () => router.back() },
      ]);
    } catch (error) {
      if (!(error instanceof Error) || error.name !== "NetworkError") {
        showNotice(
          "Scan could not be completed",
          error instanceof Error
            ? error.message
            : "The server could not complete this scan. Please try again.",
        );
        return;
      }
      await saveScan(localScan);
      await queueSync("scan", id, "upsert", { ...localScan, deletedAt: null });
      await addLocalActivity({
        id,
        title: verdict.title,
        detail: "Offline rule-based check",
        status: verdict.status,
      });
      setScanRevision(value => value + 1);
      const usage = await weeklyUsage(user.id);
      showNotice(
        `${verdict.title} (offline)`,
        `${verdict.detail}\n\nLocal rule-based check only; server analysis was unavailable. This result will sync when you reconnect.\n\nThis week: ${usage.total} completed scans across all tools (${usage.connected ? "includes pending sync" : "this device only"}).`,
        [{ text: "Done", onPress: () => router.back() }],
      );
    } finally {
      setBusy(false);
    }
  };
  const transcribeAudio = async (uri: string, mimeType: string) => {
    setBusy(true);
    try {
      let audioBase64: string;
      if (Platform.OS === "web") {
        const blob = await (await fetch(uri)).blob();
        audioBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new (globalThis as any).FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.onerror = () => reject(new Error("Could not read the audio file."));
          reader.readAsDataURL(blob);
        });
      } else {
        audioBase64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }
      if (audioBase64.length > 14_000_000) throw new Error("Choose a voice note under 10 MB.");
      const result = await apiRequest<{ text: string }>("/audio/transcribe", {
          method: "POST",
          body: JSON.stringify({ audioBase64, mimeType }),
        });
        if (!result.text.trim()) {
          showNotice("No speech detected", "Try a clearer recording. No transcript was analysed.");
          return;
        }
        setContent(result.text);
        showNotice("Voice note transcribed", "Review the transcript, then select Check now.");
      } catch (error) {
        showNotice("Could not transcribe voice note", error instanceof Error ? error.message : "Check your connection and try again.");
      } finally {
        setBusy(false);
      }
  };
  const uploadVoiceNote = async () => {
    try {
      const selection = await DocumentPicker.getDocumentAsync({ type: "audio/*", copyToCacheDirectory: true, multiple: false });
      if (selection.canceled) return;
      const file = selection.assets[0];
      if ((file.size ?? 0) > 10_000_000) throw new Error("Choose a voice note under 10 MB.");
      const extension = file.name.split(".").pop()?.toLowerCase();
      const mimeType = extension === "mp3" ? "audio/mpeg"
        : extension === "wav" ? "audio/wav"
          : extension === "webm" ? "audio/webm"
            : extension === "m4a" || extension === "mp4" ? "audio/mp4" : null;
      if (!mimeType) throw new Error("Choose an MP3, M4A, MP4, WAV, or WebM audio file.");
      await transcribeAudio(file.uri, mimeType);
    } catch (error) {
      showNotice("Could not upload voice note", error instanceof Error ? error.message : "Please choose another audio file.");
    }
  };
  const transcribeRecording = async () => {
    if (recording) {
      try {
        await recorder.stop();
        setRecording(false);
        const uri = recorder.uri;
        if (!uri) return showNotice("Recording failed", "No audio file was saved.");
        await transcribeAudio(uri, Platform.OS === "web" ? "audio/webm" : "audio/mp4");
      } catch (error) {
        setRecording(false);
        showNotice("Recording failed", error instanceof Error ? error.message : "Please try again.");
      }
      return;
    }
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      showNotice("Microphone permission required", "Allow microphone access to record a voice note.");
      return;
    }
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
    } catch (error) {
      showNotice("Could not start recording", error instanceof Error ? error.message : "Try again.");
    }
  };

  const analyzeScreenshot = async (imageBase64: string, mimeType: string) => {
    setBusy(true);
    try {
      const result = await apiRequest<{ text: string }>("/screen/ocr", {
        method: "POST",
        body: JSON.stringify({ imageBase64, mimeType }),
      });
      if (!result.text.trim()) {
        showNotice("No text detected", "Choose a clearer screenshot. No screenshot text was analysed.");
        return;
      }
      setContent(result.text);
      showNotice("Screen text extracted", "Review the text, then select Check now.");
    } catch (error) {
      showNotice("Could not read screenshot", error instanceof Error ? error.message : "Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const chooseScreenshot = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      base64: true,
      quality: 0.75,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset?.base64) return;
    await analyzeScreenshot(
      asset.base64,
      asset.mimeType === "image/png" ? "image/png" : "image/jpeg",
    );
  };

  const captureScreen = async () => {
    const browserNavigator = (globalThis as any).navigator;
    const browserDocument = (globalThis as any).document;
    const getDisplayMedia = browserNavigator?.mediaDevices?.getDisplayMedia;
    if (!getDisplayMedia || !browserDocument) {
      await chooseScreenshot();
      return;
    }
    setBusy(true);
    let stream: any;
    try {
      stream = await getDisplayMedia.call(browserNavigator.mediaDevices, { video: true });
      const video = browserDocument.createElement("video");
      video.srcObject = stream;
      await video.play();
      const canvas = browserDocument.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0);
      const encoded = canvas.toDataURL("image/jpeg", 0.75).split(",")[1];
      await analyzeScreenshot(encoded, "image/jpeg");
    } catch (error) {
      showNotice("Screen capture failed", error instanceof Error ? error.message : "Choose a screenshot instead.");
    } finally {
      stream?.getTracks().forEach((track: any) => track.stop());
      setBusy(false);
    }
  };
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <LogoutButton disabled={busy || recording} />
      <Text style={[styles.title, { color: colors.foreground }]}>{label}</Text>
      <WeeklyScanSummary revision={scanRevision} />
      <Text style={{ color: colors.mutedForeground }}>
        {isScreenScan
          ? Platform.OS === "web"
            ? "Share a screen or choose a screenshot. Extracted text will be checked for scam signals."
            : "Choose a screenshot to check for scam signals. Live capture of other apps is not available in Expo Go."
          : guidance}
      </Text>
      <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
        {t("aiPrivacyNotice")}
      </Text>
      {notice && (
        <View accessibilityRole="alert" style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 16, gap: 10, marginTop: 16 }}>
          <Text style={{ color: colors.foreground, fontWeight: "800" }}>{notice.title}</Text>
          <Text selectable style={{ color: colors.foreground, lineHeight: 22 }}>{notice.message}</Text>
          {notice.onDone && (
            <Pressable accessibilityRole="button" onPress={() => notice.onDone?.()}>
              <Text style={{ color: colors.primary, fontWeight: "800" }}>Done</Text>
            </Pressable>
          )}
        </View>
      )}
      {isScreenScan && (
        <Pressable disabled={busy} onPress={() => void captureScreen()} style={[styles.button, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
          <Text style={{ color: colors.foreground, fontWeight: "800" }}>{busy ? "Reading screen..." : Platform.OS === "web" ? "Capture screen / choose screenshot" : "Choose screenshot"}</Text>
        </Pressable>
      )}
      {scanKind === "voice" && (
        <View>
        <Pressable disabled={busy} onPress={() => void transcribeRecording()} style={[styles.button, { backgroundColor: recording ? colors.destructive : colors.card, borderColor: colors.border, borderWidth: recording ? 0 : 1 }]}>
          <Text style={{ color: recording ? "#fff" : colors.foreground, fontWeight: "800" }}>{recording ? "Stop and transcribe" : "Record voice note"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={busy || recording} onPress={() => void uploadVoiceNote()} style={[styles.button, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, opacity: busy || recording ? 0.6 : 1 }]}>
          <Text style={{ color: colors.foreground, fontWeight: "800" }}>Upload voice note</Text>
        </Pressable>
        </View>
      )}
      <TextInput
        testID="scan-input"
        multiline
        textAlignVertical="top"
        value={content}
        onChangeText={setContent}
        maxLength={12000}
        placeholder={guidance}
        placeholderTextColor={colors.mutedForeground}
        style={[
          styles.input,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            color: colors.foreground,
          },
        ]}
      />
      <Text style={{ color: colors.mutedForeground, textAlign: "right" }}>
        {content.length}/12000
      </Text>
      <Pressable
        testID="run-scan"
        disabled={busy}
        onPress={() => void submit()}
        style={[styles.button, { backgroundColor: colors.primary }]}
      >
        <Text style={{ color: colors.primaryForeground, fontWeight: "800" }}>
          {busy ? "Checking..." : "Check now"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  screen: { flexGrow: 1, padding: 22, paddingTop: 70, paddingBottom: 40 },
  title: { fontSize: 30, fontWeight: "800", marginBottom: 8 },
  input: {
    minHeight: 230,
    borderWidth: 1,
    borderRadius: 16,
    padding: 15,
    fontSize: 16,
    marginTop: 28,
  },
  button: {
    height: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
});
