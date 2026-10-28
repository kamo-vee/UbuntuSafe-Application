import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../..", ".env"), quiet: true });
const { pool } = await import("@workspace/db");
const { createDatabaseBackup, runAutomaticBackups, restoreDatabaseToEmptyTarget } = await import("./lib/database-backup.js");
const { backupSettings, listBackupFiles } = await import("./lib/backup-vault.js");
try {
  const command = process.argv[2];
  if (command === "database") {
    console.log(JSON.stringify(await createDatabaseBackup(), null, 2));
  } else if (command === "automatic") {
    if (!backupSettings().enabled || !backupSettings().ready) throw new Error("Configure BACKUP_ENABLED=true and BACKUP_ENCRYPTION_KEY before scheduling automatic backups.");
    await runAutomaticBackups();
    console.log("Automatic backup check completed. Use backup:status to inspect completed files.");
  } else if (command === "status") {
    const { enabled, ready, hours, days } = backupSettings();
    console.log(JSON.stringify({ enabled, ready, scheduleHours: hours, retentionDays: days, files: await listBackupFiles() }, null, 2));
  } else if (command === "restore" && process.argv.includes("--confirm-empty-target")) {
    const id = process.argv[3];
    if (!id || !process.env.RESTORE_DATABASE_URL) throw new Error("Specify the backup ID and a separate empty RESTORE_DATABASE_URL in your private .env.");
    await restoreDatabaseToEmptyTarget(id, process.env.RESTORE_DATABASE_URL);
    console.log("Restore completed into the separate recovery database. Inspect it before changing DATABASE_URL. User sessions and recovery codes were invalidated. Keep your original .env securely; administrator/provider settings are not inside the database backup.");
  } else throw new Error("Use database, automatic, status, or restore BACKUP_ID --confirm-empty-target. Read BACKUP-RESTORE.md first.");
} catch (error) {
  // Only deliberately safe backup messages, never driver errors or connection strings.
  console.error(error instanceof Error && ("expose" in error || !("code" in error)) ? error.message : "Backup command failed. Check private configuration and database/tool availability.");
  process.exitCode = 1;
} finally { await pool.end(); }
