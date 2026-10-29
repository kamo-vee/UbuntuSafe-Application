import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { unlink, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { pool } from "@workspace/db";
import { backupConfigurationIfDue, createConfigurationBackup } from "./configuration-backup.js";
import { backupSettings, BackupError, saveEncrypted, listBackupFiles, pruneBackupFiles,
  saveSnapshotJson, backupNote, decryptToFile } from "./backup-vault.js";

function postgresEnvironment(connection: string) {
  const url = new URL(connection);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new BackupError("Use a PostgreSQL database URL.");
  return { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGCONNECT_TIMEOUT: "15",
    ...(url.searchParams.get("sslmode") ? { PGSSLMODE: url.searchParams.get("sslmode")! } : {}) };
}
function postgresTool(name: "pg_dump" | "pg_restore", args: string[], connection: string) {
  const executable = process.env[name === "pg_dump" ? "PG_DUMP_PATH" : "PG_RESTORE_PATH"] || name;
  const child = spawn(executable, args, { env: postgresEnvironment(connection), stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true, timeout: 10 * 60000 });
  // Never forward PostgreSQL diagnostics: they may contain private identifiers.
  child.stderr.resume();
  const completed = new Promise<void>((done, reject) => {
    child.once("error", () => reject(new BackupError("PostgreSQL backup tools are unavailable. Set PG_DUMP_PATH and PG_RESTORE_PATH; see BACKUP-RESTORE.md.")));
    child.once("close", code => code === 0 ? done() : reject(new BackupError("PostgreSQL backup/restore failed. Check tool version, database permissions and disk space.")));
  });
  return { child, completed };
}
export async function createDatabaseBackup() {
  const settings = backupSettings();
  if (!settings.enabled || !settings.ready) throw new BackupError("Automatic backups need BACKUP_ENABLED=true and a valid BACKUP_ENCRYPTION_KEY.");
  const client = await pool.connect();
  let locked = false;
  try {
    locked = (await client.query("SELECT pg_try_advisory_lock(74893201) AS locked")).rows[0].locked;
    if (!locked) throw new BackupError("A database backup is already running. Try again later.");
    const { child, completed } = postgresTool("pg_dump", ["--format=custom", "--no-owner", "--no-acl"], process.env.DATABASE_URL!);
    // Propagate nonzero tool exits through the source before publishing the file.
    const source = Readable.from((async function* () {
      for await (const chunk of child.stdout) yield chunk;
      await completed;
    })());
    // Attach a handler immediately; the generator also awaits completion.
    void completed.catch(() => undefined);
    try {
      const backup = await saveEncrypted(source);
      await pruneBackupFiles();
      await backupNote("Database backup completed. Copy encrypted files to a separate device for disaster protection.");
      return backup;
    } finally { child.kill(); }
  } catch (error) {
    await backupNote("Database backup failed. Check backup configuration, PostgreSQL tools and free disk space.").catch(() => undefined);
    throw error;
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock(74893201)");
    client.release();
  }
}
export async function createSystemBackup() {
  const configuration = await createConfigurationBackup();
  const database = await createDatabaseBackup();
  await backupNote("Database and private .env backups completed. Copy encrypted files off this computer and keep the key separately.");
  return { database, configuration };
}
export async function createPersonalSnapshot(owner: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const profile = (await client.query("SELECT id, full_name, surname, language, created_at FROM ubuntu_users WHERE id=$1 AND deleted_at IS NULL", [owner])).rows[0];
    if (!profile) throw new BackupError("Account not available for backup.");
    const scans = (await client.query("SELECT * FROM scans WHERE user_id=$1", [owner])).rows;
    const reports = (await client.query("SELECT * FROM community_reports WHERE user_id=$1", [owner])).rows;
    const feedback = (await client.query("SELECT * FROM community_feedback WHERE user_id=$1", [owner])).rows;
    await client.query("COMMIT");
    const result = await saveSnapshotJson(owner, { version: 1, owner, profile, scans, reports, feedback });
    await pruneBackupFiles(owner);
    return result;
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
  finally { client.release(); }
}
export async function runAutomaticBackups() {
  const settings = backupSettings();
  if (!settings.enabled || !settings.ready) return;
  const files = await listBackupFiles();
  if (!files[0] || Date.now() - Date.parse(files[0].createdAt) >= settings.hours * 3600000)
    await createDatabaseBackup();
  let configurationFailed = false;
  try { await backupConfigurationIfDue(); }
  catch { configurationFailed = true; }
  const users = (await pool.query("SELECT id FROM ubuntu_users WHERE deleted_at IS NULL")).rows;
  let failed = 0;
  for (const user of users) {
    try {
      const snapshots = await listBackupFiles(user.id);
      if (!snapshots[0] || Date.now() - Date.parse(snapshots[0].createdAt) >= settings.hours * 3600000)
        await createPersonalSnapshot(user.id);
    } catch { failed++; }
  }
  if (configurationFailed)
    throw new BackupError("Database backup is available, but private .env backup failed. Check the root .env and backup settings; personal snapshots were still attempted.");
  if (failed) await backupNote("Database backup completed, but some personal snapshots failed. Review disk space and personal snapshot size limits.");
  else if (process.env.BACKUP_CONFIG_ENABLED !== "false")
    await backupNote("Database, private .env and personal backups are current. Copy encrypted files off this computer and keep the key separately.");
}
export function startAutomaticBackups() {
  const tick = () => { void runAutomaticBackups().catch(error => backupNote(error instanceof BackupError ? error.message : "Automatic backup failed. Check PostgreSQL tools, encryption settings and free disk space.").catch(() => undefined)); };
  tick();
  const timer = setInterval(tick, 15 * 60000);
  timer.unref();
}

/** Disaster recovery never targets the running database or a nonempty target. */
export async function restoreDatabaseToEmptyTarget(id: string, targetUrl: string) {
  if (!targetUrl || targetUrl === process.env.DATABASE_URL) throw new BackupError("Choose a separate, empty recovery database using RESTORE_DATABASE_URL.");
  const source = new URL(process.env.DATABASE_URL!), target = new URL(targetUrl);
  if (source.hostname === target.hostname && (source.port || "5432") === (target.port || "5432") && source.pathname === target.pathname)
    throw new BackupError("Refusing to restore over the running database.");
  const client = new pg.Client({ connectionString: targetUrl });
  const dir = await mkdtemp(join(tmpdir(), "ubuntusafe-restore-")), file = join(dir, "database.dump");
  try {
    await client.connect();
    const tables = await client.query("SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S') LIMIT 1");
    if (tables.rowCount) throw new BackupError("Recovery database is not empty. No data was changed. Create a separate empty database.");
    // Authenticate the complete ciphertext before running any database command.
    await decryptToFile(id, file);
    const { completed } = postgresTool("pg_restore", ["--dbname", target.pathname.slice(1),
      "--no-owner", "--no-acl", "--exit-on-error", "--single-transaction", file], targetUrl);
    await completed;
    // A recovered database must not reactivate previously issued user sessions or reset codes.
    await client.query("BEGIN");
    await client.query("UPDATE ubuntu_users SET session_version=session_version+1");
    await client.query("DELETE FROM password_reset_tokens");
    await client.query("DELETE FROM email_verification_tokens");
    await client.query("COMMIT");
  } finally {
    await client.end().catch(() => undefined);
    await unlink(file).catch(() => undefined);
    await rm(dir, { recursive: true, force: true });
  }
}
