import { randomUUID } from "node:crypto";
import { readFile, stat, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import { BackupError, backupPath, backupSettings, configurationScope, decryptToFile,
  listBackupFiles, pruneBackupFiles, saveEncrypted, vaultDirectory } from "./backup-vault.js";

const maximumBytes = 1024 * 1024;

export function configurationSourcePath() {
  // pnpm runs the API package with artifacts/api-server as its working directory.
  return resolve(process.env.BACKUP_CONFIG_SOURCE || "../../.env");
}

export async function createConfigurationBackup() {
  const settings = backupSettings();
  if (!settings.enabled || !settings.ready || process.env.BACKUP_CONFIG_ENABLED === "false")
    throw new BackupError("Configuration backup requires enabled backups, BACKUP_CONFIG_ENABLED=true and the saved encryption key.");
  let content: string;
  try {
    const source = configurationSourcePath();
    const info = await stat(source);
    if (!info.isFile() || info.size > maximumBytes) throw new Error();
    content = await readFile(source, "utf8");
    if (!content.trim() || Buffer.byteLength(content) > maximumBytes) throw new Error();
  } catch {
    throw new BackupError("Private .env backup failed. Check that the root .env exists, is readable and is no larger than 1 MB.");
  }
  const result = await saveEncrypted(Readable.from([JSON.stringify({
    version: 1, kind: "configuration", content,
  })]), configurationScope);
  await pruneBackupFiles(configurationScope);
  return result;
}

export async function backupConfigurationIfDue() {
  if (process.env.BACKUP_CONFIG_ENABLED === "false") return;
  const files = await listBackupFiles(configurationScope);
  if (!files[0] || Date.now() - Date.parse(files[0].createdAt) >= backupSettings().hours * 3600000)
    await createConfigurationBackup();
}

/** Owner-only CLI recovery: never expose credentials through an HTTP endpoint. */
export async function restoreConfigurationBackup(id: string, target = resolve("../../.env.recovered")) {
  const temporary = join(await vaultDirectory(), `${randomUUID()}.restore-partial`);
  try {
    if ((await stat(backupPath(id, configurationScope))).size > maximumBytes * 7)
      throw new Error();
    await decryptToFile(id, temporary, configurationScope);
    const data = JSON.parse(await readFile(temporary, "utf8"));
    if (data.version !== 1 || data.kind !== "configuration" || typeof data.content !== "string" ||
        !data.content.trim() || Buffer.byteLength(data.content) > maximumBytes) throw new Error();
    // Authenticate and validate before publishing; wx preserves existing files.
    await writeFile(target, data.content, { flag: "wx", mode: 0o600 });
    return { restored: true, message: "Private configuration recovered to a new file. Review it locally before replacing .env; restart the API afterward." };
  } catch {
    throw new BackupError("Configuration recovery failed. Check the original key, backup ID and integrity. The output file must not already exist.");
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}
