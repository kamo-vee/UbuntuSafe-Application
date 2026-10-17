import { useMemo, useState } from "react";
import {
  Alert,
  Pressable,
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
import * as FileSystem from "expo-file-system/legacy";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
} from "expo-audio";

export default function ToolScreen() {
  const router = useRouter();
  const { kind = "message" } = useLocalSearchParams<{ kind?: string }>();
  const { colors, user, addLocalActivity, t } = useApp();
  const isScreenScan = kind === "screen";
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
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
    if (!user || content.trim().length < 3)
      return Alert.alert(
        "Add something to scan",
        "Enter at least 3 characters first.",
      );
    let verdict;
    try {
      verdict = scanOffline(scanKind, content.trim());
    } catch (error) {
      Alert.alert(
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
      content: content.trim(),
      status: verdict.status,
      title: verdict.title,
      detail: verdict.detail,
      createdAt: now,
      updatedAt: now,
      synced: 0 as const,
    };
    await saveScan(localScan);
    await queueSync("scan", id, "upsert", localScan);
    await addLocalActivity({
      id,
      title: verdict.title,
      detail: "Just now",
      status: verdict.status,
    });
    try {
      const remote = await apiRequest<{
        id: string;
        status: "safe" | "warning" | "danger";
        title: string;
        detail: string;
        analysisMode: "ai" | "rules";
      }>("/scan", {
        method: "POST",
        body: JSON.stringify({ kind: scanKind, content: content.trim() }),
      });
      await addLocalActivity({
        id: remote.id,
        title: remote.title,
        detail: "Just now",
        status: remote.status,
      });
      const resultDetail = remote.analysisMode === "rules"
        ? `${remote.detail}\n\nAI risk analysis is not configured; this result uses local rules.`
        : remote.detail;
      Alert.alert(remote.title, resultDetail, [
        { text: "Done", onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert(
        `${verdict.title} (offline)`,
        `${verdict.detail}\n\nThis scan will sync automatically when you reconnect.`,
        [{ text: "Done", onPress: () => router.back() }],
      );
    } finally {
      setBusy(false);
    }
  };
  const transcribeRecording = async () => {
    if (recording) {
      await recorder.stop();
      setRecording(false);
      const uri = recorder.uri;
      if (!uri) return Alert.alert("Recording failed", "No audio file was saved.");
      setBusy(true);
      try {
        const audioBase64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const result = await apiRequest<{ text: string }>("/audio/transcribe", {
          method: "POST",
          body: JSON.stringify({ audioBase64, mimeType: "audio/mp4" }),
        });
        setContent(result.text);
        Alert.alert("Voice note transcribed", "Review the transcript, then select Check now.");
      } catch (error) {
        Alert.alert("Could not transcribe voice note", error instanceof Error ? error.message : "Check your connection and try again.");
      } finally {
        setBusy(false);
      }
      return;
    }
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Microphone permission required", "Allow microphone access to record a voice note.");
      return;
    }
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
    } catch (error) {
      Alert.alert("Could not start recording", error instanceof Error ? error.message : "Try again.");
    }
  };

  const analyzeScreenshot = async (imageBase64: string, mimeType: string) => {
    setBusy(true);
    try {
      const result = await apiRequest<{ text: string }>("/screen/ocr", {
        method: "POST",
        body: JSON.stringify({ imageBase64, mimeType }),
      });
      setContent(result.text);
      Alert.alert("Screen text extracted", "Review the text, then select Check now.");
    } catch (error) {
      Alert.alert("Could not read screenshot", error instanceof Error ? error.message : "Check your connection and try again.");
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
      Alert.alert("Screen capture failed", error instanceof Error ? error.message : "Choose a screenshot instead.");
    } finally {
      stream?.getTracks().forEach((track: any) => track.stop());
      setBusy(false);
    }
  };
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>{label}</Text>
      <Text style={{ color: colors.mutedForeground }}>
        {isScreenScan
          ? "Capture the screen or choose a screenshot. Extracted text will be checked as a suspicious message."
          : guidance}
      </Text>
      <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
        {t("aiPrivacyNotice")}
      </Text>
      {isScreenScan && (
        <Pressable disabled={busy} onPress={() => void captureScreen()} style={[styles.button, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
          <Text style={{ color: colors.foreground, fontWeight: "800" }}>{busy ? "Reading screen..." : "Capture screen / choose screenshot"}</Text>
        </Pressable>
      )}
      {scanKind === "voice" && (
        <Pressable disabled={busy} onPress={() => void transcribeRecording()} style={[styles.button, { backgroundColor: recording ? colors.destructive : colors.card, borderColor: colors.border, borderWidth: recording ? 0 : 1 }]}>
          <Text style={{ color: recording ? "#fff" : colors.foreground, fontWeight: "800" }}>{recording ? "Stop and transcribe" : "Record voice note"}</Text>
        </Pressable>
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
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, padding: 22, paddingTop: 70 },
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
