import { getWeeklyUsage } from "@workspace/api-client-react";
import { listScans } from "./localDb";

export const toolLabels: Record<string, string> = {
  message: "Messages", voice: "Voice", email: "Email", link: "Links", job: "Jobs", screen: "Screenshots",
};
export async function weeklyUsage(userId: string) {
  const today = new Date(Date.now() + 2 * 3600000);
  today.setUTCHours(0, 0, 0, 0);
  today.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7));
  const start = today.getTime() - 2 * 3600000, end = start + 7 * 86400000;
  const local = (await listScans(userId)).filter(scan => {
    const time = Date.parse(scan.createdAt); return time >= start && time < end;
  });
  const byId = new Map<string, string>();
  let connected = false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const server = await getWeeklyUsage({ signal: controller.signal });
    for (const scan of server.scans) byId.set(scan.id, scan.tool);
    connected = true;
  } catch { /* Preserve a truthful device-only count when offline. */ }
  finally { clearTimeout(timeout); }
  for (const scan of local) {
    if (!connected || !scan.synced) byId.set(scan.id, scan.tool ?? scan.kind);
  }
  const tools = Object.keys(toolLabels).map(tool => ({
    tool, label: toolLabels[tool], count: [...byId.values()].filter(value => value === tool).length,
  }));
  return { total: byId.size, tools, connected, pending: local.filter(scan => !scan.synced).length };
}
