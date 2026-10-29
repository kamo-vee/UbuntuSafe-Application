import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { exportAdminReport } from "@workspace/api-client-react";

export function reportFileName(date = new Date()) {
  const stamp = date.toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return `ubuntusafe-admin-report-${stamp}.csv`;
}

/** Fetches the server CSV and saves (web) or shares (native) it. Returns the file name. */
export async function downloadAdminReport(): Promise<string> {
  const csv = await exportAdminReport({ responseType: "text" });
  if (typeof csv !== "string" || csv.length === 0) throw new Error("The report was empty.");
  const name = reportFileName();
  if (Platform.OS === "web") {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return name;
  }
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(csv);
  if (!(await Sharing.isAvailableAsync())) throw new Error("File sharing is unavailable on this device. Download the report in the browser.");
  await Sharing.shareAsync(file.uri, { mimeType: "text/csv", dialogTitle: "Save or share admin report", UTI: "public.comma-separated-values-text" });
  return name;
}

export function errorMessage(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback;
}

export function fieldErrorsFrom(e: unknown): Record<string, string> {
  const data = (e as { data?: unknown } | null)?.data;
  const fe = data && typeof data === "object" ? (data as { fieldErrors?: unknown }).fieldErrors : undefined;
  const out: Record<string, string> = {};
  if (fe && typeof fe === "object") {
    for (const [k, v] of Object.entries(fe as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
      else if (Array.isArray(v) && typeof v[0] === "string") out[k] = v[0];
    }
  }
  return out;
}
