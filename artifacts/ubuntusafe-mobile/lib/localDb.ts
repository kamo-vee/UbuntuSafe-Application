import * as SQLite from "expo-sqlite";

export type LocalScan = {
  id: string;
  userId: string;
  kind: string;
  tool?: string | null;
  content: string;
  status: "safe" | "warning" | "danger";
  title: string;
  detail: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  synced: number;
};

const database = SQLite.openDatabaseSync("ubuntusafe.db");

export async function initLocalDb() {
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS scans (
      id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, kind TEXT NOT NULL, content TEXT NOT NULL,
      status TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, deleted_at TEXT, synced INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS community_reports (
      id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, category TEXT NOT NULL, details TEXT NOT NULL,
      status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, synced INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS ubuntu_users (id TEXT PRIMARY KEY NOT NULL, email TEXT NOT NULL, full_name TEXT NOT NULL, password_hash TEXT);
    CREATE TABLE IF NOT EXISTS activities (id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sync_outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, entity TEXT NOT NULL, entity_id TEXT NOT NULL, operation TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sync_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
  `);
  const columns = await database.getAllAsync<{ name: string }>("PRAGMA table_info(scans)");
  if (!columns.some(column => column.name === "tool")) await database.execAsync("ALTER TABLE scans ADD COLUMN tool TEXT");
}

export async function clearCachedUserData() {
  await database.withTransactionAsync(async () => {
    await database.runAsync("DELETE FROM scans");
    await database.runAsync("DELETE FROM community_reports");
    await database.runAsync("DELETE FROM activities");
    await database.runAsync("DELETE FROM sync_outbox");
    await database.runAsync("DELETE FROM sync_meta");
    await database.runAsync("DELETE FROM ubuntu_users");
  });
}

export async function saveScan(scan: LocalScan) {
  await database.runAsync(
    `INSERT OR REPLACE INTO scans (id,user_id,kind,content,status,title,detail,created_at,updated_at,deleted_at,synced,tool)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    scan.id,
    scan.userId,
    scan.kind,
    scan.content,
    scan.status,
    scan.title,
    scan.detail,
    scan.createdAt,
    scan.updatedAt,
    scan.deletedAt ?? null,
    scan.synced,
    scan.tool ?? scan.kind,
  );
}

export async function listScans(userId: string): Promise<LocalScan[]> {
  return database.getAllAsync<LocalScan>(
    "SELECT id, user_id as userId, kind, tool, content, status, title, detail, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt, synced FROM scans WHERE user_id=? AND deleted_at IS NULL ORDER BY created_at DESC",
    userId,
  );
}

export async function clearScansForUser(userId: string) {
  const scans = await listScans(userId);
  const deletedAt = new Date().toISOString();
  for (const scan of scans) {
    const tombstone = {
      ...scan,
      deletedAt,
      updatedAt: deletedAt,
      synced: 0 as const,
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
  await database.runAsync(
    "INSERT INTO sync_outbox (entity,entity_id,operation,payload,created_at) VALUES (?,?,?,?,?)",
    entity,
    entityId,
    operation,
    JSON.stringify(payload),
    new Date().toISOString(),
  );
}

export async function listOutbox() {
  return database.getAllAsync<{
    id: number;
    entity: string;
    entity_id: string;
    operation: string;
    payload: string;
  }>("SELECT * FROM sync_outbox ORDER BY id");
}

export async function removeOutbox(ids: number[]) {
  if (!ids.length) return;
  await database.runAsync(
    `DELETE FROM sync_outbox WHERE id IN (${ids.map(() => "?").join(",")})`,
    ...ids,
  );
}

export async function getMeta(key: string) {
  return (
    (
      await database.getFirstAsync<{ value: string }>(
        "SELECT value FROM sync_meta WHERE key=?",
        key,
      )
    )?.value ?? null
  );
}
export async function setMeta(key: string, value: string) {
  await database.runAsync(
    "INSERT OR REPLACE INTO sync_meta (key,value) VALUES (?,?)",
    key,
    value,
  );
}
