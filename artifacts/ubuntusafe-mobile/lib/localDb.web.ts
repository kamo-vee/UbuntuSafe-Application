import AsyncStorage from "@react-native-async-storage/async-storage";

export type LocalScan = {
  id: string;
  userId: string;
  kind: string;
  content: string;
  status: "safe" | "warning" | "danger";
  title: string;
  detail: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  synced: number;
};

type OutboxItem = {
  id: number;
  entity: string;
  entity_id: string;
  operation: string;
  payload: string;
  created_at: string;
};

const keys = {
  scans: "ubuntusafe.web.scans",
  outbox: "ubuntusafe.web.outbox",
  meta: "ubuntusafe.web.meta",
};

async function read<T>(key: string, fallback: T): Promise<T> {
  const value = await AsyncStorage.getItem(key);
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function write<T>(key: string, value: T) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function initLocalDb() {}

export async function clearCachedUserData() {
  await Promise.all(Object.values(keys).map((key) => AsyncStorage.removeItem(key)));
}

export async function saveScan(scan: LocalScan) {
  const scans = await read<LocalScan[]>(keys.scans, []);
  const next = scans.filter((item) => item.id !== scan.id);
  next.push(scan);
  await write(keys.scans, next);
}

export async function listScans(userId: string): Promise<LocalScan[]> {
  const scans = await read<LocalScan[]>(keys.scans, []);
  return scans
    .filter((scan) => scan.userId === userId && !scan.deletedAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function clearScansForUser(userId: string) {
  const scans = await listScans(userId);
  const deletedAt = new Date().toISOString();
  for (const scan of scans) {
    const tombstone = {
      ...scan,
      deletedAt,
      updatedAt: deletedAt,
      synced: 0,
    };
    await saveScan(tombstone);
    await queueSync("scan", scan.id, "upsert", tombstone);
  }
  return scans.length;
}

export async function queueSync(
  entity: string,
  entityId: string,
  operation: string,
  payload: unknown,
) {
  const outbox = await read<OutboxItem[]>(keys.outbox, []);
  outbox.push({
    id: outbox.reduce((max, item) => Math.max(max, item.id), 0) + 1,
    entity,
    entity_id: entityId,
    operation,
    payload: JSON.stringify(payload),
    created_at: new Date().toISOString(),
  });
  await write(keys.outbox, outbox);
}

export async function listOutbox(): Promise<OutboxItem[]> {
  return read(keys.outbox, []);
}

export async function removeOutbox(ids: number[]) {
  if (!ids.length) return;
  const removed = new Set(ids);
  const outbox = await read<OutboxItem[]>(keys.outbox, []);
  await write(
    keys.outbox,
    outbox.filter((item) => !removed.has(item.id)),
  );
}

export async function getMeta(key: string) {
  const meta = await read<Record<string, string>>(keys.meta, {});
  return meta[key] ?? null;
}

export async function setMeta(key: string, value: string) {
  const meta = await read<Record<string, string>>(keys.meta, {});
  meta[key] = value;
  await write(keys.meta, meta);
}
