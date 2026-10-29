import { apiRequest } from "./api";
import {
  getMeta,
  listOutbox,
  removeOutbox,
  saveScan,
  setMeta,
} from "./localDb";

export async function syncNow() {
  const outbox = await listOutbox();
  if (outbox.length) {
    await apiRequest("/sync", {
      method: "POST",
      body: JSON.stringify({
        scans: outbox
          .filter((item) => item.entity === "scan")
          .map((item) => JSON.parse(item.payload)),
        reports: outbox
          .filter((item) => item.entity === "report")
          .map((item) => JSON.parse(item.payload)),
      }),
    });
    await removeOutbox(outbox.map((item) => item.id));
  }
  const since = (await getMeta("lastSyncedAt")) ?? new Date(0).toISOString();
  const pulled = await apiRequest<{
    scans: Array<Parameters<typeof saveScan>[0]>;
    syncedAt: string;
  }>(`/sync?since=${encodeURIComponent(since)}`);
  for (const scan of pulled.scans) await saveScan({ ...scan, synced: 1 });
  await setMeta("lastSyncedAt", pulled.syncedAt);
  return pulled.syncedAt;
}
