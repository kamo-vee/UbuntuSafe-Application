import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rename, stat, unlink, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { Transform, Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const MAGIC = Buffer.from("USV1");
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class BackupError extends Error {
  statusCode = 503;
  expose = true;
}
export function backupSettings() {
  const enabled = process.env.BACKUP_ENABLED !== "false";
  const hours = Number(process.env.BACKUP_INTERVAL_HOURS || 24);
  const days = Number(process.env.BACKUP_RETENTION_DAYS || 30);
  const ready = /^[A-Za-z0-9+/]{43}=$/.test(process.env.BACKUP_ENCRYPTION_KEY || "") &&
    Buffer.from(process.env.BACKUP_ENCRYPTION_KEY || "", "base64").length === 32;
  return { enabled, ready, hours: Number.isFinite(hours) && hours >= 1 ? hours : 24,
    days: Number.isFinite(days) && days >= 1 ? days : 30,
    directory: resolve(process.env.BACKUP_DIRECTORY || "private-backups") };
}
function key() {
  if (!backupSettings().ready) throw new BackupError("Backup setup required. Generate and securely save BACKUP_ENCRYPTION_KEY; see BACKUP-RESTORE.md.");
  return Buffer.from(process.env.BACKUP_ENCRYPTION_KEY!, "base64");
}
export async function vaultDirectory() {
  const dir = backupSettings().directory;
  await mkdir(dir, { recursive: true, mode: 0o700 });
  return dir;
}
export const configurationScope = { kind: "configuration" } as const;
type VaultScope = string | typeof configurationScope;
function suffix(owner?: VaultScope) {
  return typeof owner === "object" ? ".usconfig" : owner ? ".ussnapshot" : ".usdb";
}
function prefix(owner?: VaultScope) {
  if (typeof owner === "object") {
    if (owner.kind !== "configuration") throw new BackupError("Invalid backup scope.");
    return "configuration-";
  }
  if (owner && !uuidPattern.test(owner)) throw new BackupError("Invalid snapshot owner.");
  return owner ? `user-${owner}-` : "database-";
}
export async function listBackupFiles(owner?: VaultScope) {
  const dir = await vaultDirectory();
  const start = prefix(owner), ending = suffix(owner);
  const files = await Promise.all((await readdir(dir)).filter(name =>
    name.startsWith(start) && name.endsWith(ending) && uuidPattern.test(name.slice(start.length, -ending.length)))
    .map(async name => {
      const info = await stat(join(dir, name));
      return { id: name.slice(start.length, -ending.length), createdAt: info.mtime.toISOString(), bytes: info.size };
    }));
  return files.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function saveEncrypted(source: Readable, owner?: VaultScope) {
  const dir = await vaultDirectory();
  const id = randomUUID();
  const target = join(dir, `${prefix(owner)}${id}${suffix(owner)}`), temporary = `${target}.partial`;
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), iv);
  // Header is public; GCM authenticates it and all encrypted bytes.
  cipher.setAAD(MAGIC);
  const output = createWriteStream(temporary, { mode: 0o600, flags: "wx" });
  output.write(Buffer.concat([MAGIC, iv]));
  const trailer = new Transform({
    transform(chunk, _encoding, next) { next(null, chunk); },
    flush(next) { this.push(cipher.getAuthTag()); next(); },
  });
  try {
    await pipeline(source, cipher, trailer, output);
    await rename(temporary, target);
    const info = await stat(target);
    return { id, createdAt: info.mtime.toISOString(), bytes: info.size };
  } catch {
    await unlink(temporary).catch(() => undefined);
    throw new BackupError("Encrypted backup failed. Check disk space, PostgreSQL tools and backup settings.");
  }
}
export function backupPath(id: string, owner?: VaultScope) {
  if (!uuidPattern.test(id)) throw new BackupError("Invalid backup identifier.");
  return join(backupSettings().directory, `${prefix(owner)}${id}${suffix(owner)}`);
}
export async function decryptToFile(id: string, target: string, owner?: VaultScope) {
  const path = backupPath(id, owner);
  const handle = await import("node:fs/promises").then(fs => fs.open(path, "r"));
  try {
    const info = await handle.stat();
    if (info.size < 32) throw new Error("Incomplete backup");
    const header = Buffer.alloc(16), tag = Buffer.alloc(16);
    await handle.read(header, 0, 16, 0);
    await handle.read(tag, 0, 16, info.size - 16);
    if (!header.subarray(0, 4).equals(MAGIC)) throw new Error("Wrong format");
    const decipher = createDecipheriv("aes-256-gcm", key(), header.subarray(4));
    decipher.setAAD(MAGIC); decipher.setAuthTag(tag);
    await pipeline(createReadStream(path, { start: 16, end: info.size - 17 }), decipher,
      createWriteStream(target, { flags: "wx", mode: 0o600 }));
  } catch {
    await unlink(target).catch(() => undefined);
    throw new BackupError("Backup could not be authenticated. Use the original encryption key and an intact backup.");
  } finally { await handle.close(); }
}
export async function loadSnapshot(id: string, owner: string) {
  const dir = await vaultDirectory(), temporary = join(dir, `${randomUUID()}.restore-partial`);
  try {
    const info = await stat(backupPath(id, owner));
    if (info.size > 32 * 1024 * 1024) throw new BackupError("Snapshot exceeds the restore size limit.");
    await decryptToFile(id, temporary, owner);
    return JSON.parse(await readFile(temporary, "utf8")) as unknown;
  } finally { await unlink(temporary).catch(() => undefined); }
}
export async function saveSnapshotJson(owner: string, data: unknown) {
  const body = JSON.stringify(data);
  if (Buffer.byteLength(body) > 32 * 1024 * 1024) throw new BackupError("Personal snapshot is too large. Full database backup still protects your data.");
  return saveEncrypted(Readable.from([body]), owner);
}
export async function pruneBackupFiles(owner?: VaultScope) {
  const files = await listBackupFiles(owner), before = Date.now() - backupSettings().days * 86400000;
  // Always retain at least the newest completed backup for this scope.
  for (const file of files.slice(1)) if (Date.parse(file.createdAt) < before)
    await unlink(backupPath(file.id, owner));
}
export async function backupNote(message: string) {
  await writeFile(join(await vaultDirectory(), "status.json"), JSON.stringify({ message, at: new Date().toISOString() }), { mode: 0o600 });
}
export async function readBackupNote() {
  try { return JSON.parse(await readFile(join(await vaultDirectory(), "status.json"), "utf8")) as { message: string; at: string }; }
  catch { return null; }
}
