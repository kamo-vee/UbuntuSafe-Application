import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { pool } from "@workspace/db";
import { RestoreBackupRecordBody } from "@workspace/api-zod";
import { requireAuth } from "../middleware/auth.js";
import { backupSettings, listBackupFiles, loadSnapshot, readBackupNote, BackupError } from "../lib/backup-vault.js";
import { createDatabaseBackup, createSystemBackup, createPersonalSnapshot } from "../lib/database-backup.js";

const router = Router();
router.use(requireAuth);
router.use(rateLimit({ windowMs: 60000, limit: 20, standardHeaders: true, legacyHeaders: false }));
const tables = {
  scans: { name: "scans", title: "title" },
  reports: { name: "community_reports", title: "details" },
  feedback: { name: "community_feedback", title: "message" },
  users: { name: "ubuntu_users", title: "full_name" },
} as const;
async function audit(actor: string, role: string, action: string, kind: string | null, id: string, count: number) {
  await pool.query("INSERT INTO recovery_audit(actor_id,actor_role,action,record_kind,record_id,restored_count) VALUES($1,$2,$3,$4,$5,$6)",
    [actor, role, action, kind, id, count]);
}
router.get("/", async (req, res, next) => {
  try {
    const admin = req.user!.role === "admin", settings = backupSettings();
    const deleted = [];
    for (const [kind, table] of Object.entries(tables)) {
      if (kind === "users" && !admin) continue;
      const result = await pool.query(`SELECT id, left(${table.title},160) AS title, deleted_at AS "deletedAt"
        FROM ${table.name} WHERE deleted_at IS NOT NULL ${admin ? "" : "AND user_id=$1"} ORDER BY deleted_at DESC LIMIT 100`,
      admin ? [] : [req.user!.id]);
      deleted.push(...result.rows.map(row => ({ ...row, kind })));
    }
    const note = await readBackupNote();
    res.json({ role: admin ? "admin" : "user", enabled: settings.enabled, ready: settings.ready,
      scheduleHours: settings.hours, retentionDays: settings.days,
      message: !settings.ready ? "Backup encryption needs setup by the system owner. Deleted records can still be restored."
        : !settings.enabled ? "Automatic database backups are disabled. Personal snapshots and deleted-record recovery remain available."
        : note?.message || "Automatic backups run while the API is running. Keep a separate off-computer copy.",
      databaseBackups: admin ? await listBackupFiles() : [],
      snapshots: admin ? [] : await listBackupFiles(req.user!.id), deleted });
  } catch (error) { next(error); }
});
router.post("/database", async (req, res, next) => {
  try {
    if (req.user!.role !== "admin") { res.status(403).json({ message: "Only administrators can back up the full database." }); return; }
    const result = process.env.BACKUP_CONFIG_ENABLED === "false"
      ? await createDatabaseBackup() : (await createSystemBackup()).database;
    await audit(req.user!.id, "admin", "database-backup", null, result.id, 0);
    res.status(201).json(result);
  } catch (error) { next(error); }
});
router.post("/snapshot", async (req, res, next) => {
  try {
    if (req.user!.role === "admin") { res.status(403).json({ message: "Use the full database backup for administrator data." }); return; }
    const result = await createPersonalSnapshot(req.user!.id);
    await audit(req.user!.id, "user", "snapshot", null, result.id, 0);
    res.status(201).json(result);
  } catch (error) { next(error); }
});
router.post("/restore", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const body = RestoreBackupRecordBody.parse(req.body);
    const admin = req.user!.role === "admin", role = admin ? "admin" : "user";
    let restored = 0;
    await client.query("BEGIN");
    if (body.action === "record") {
      if (!body.kind || !(body.kind in tables)) { res.status(400).json({ message: "Choose a record to restore." }); return; }
      if (body.kind === "users" && !admin) { res.status(403).json({ message: "Only administrators can recover deleted accounts." }); return; }
      const table = tables[body.kind];
      const result = await client.query(`UPDATE ${table.name} SET deleted_at=NULL, updated_at=now()
        ${body.kind === "users" ? ", session_version=session_version+1" : ""}
        WHERE id=$1 AND deleted_at IS NOT NULL ${admin ? "" : "AND user_id=$2"} RETURNING id`,
      admin ? [body.id] : [body.id, req.user!.id]);
      restored = result.rowCount || 0;
    } else {
      if (admin) { res.status(403).json({ message: "Personal snapshots can only be restored by their owner." }); return; }
      const data = z.object({ version: z.literal(1), owner: z.literal(req.user!.id),
        scans: z.array(z.record(z.string(), z.unknown())).max(100000),
        reports: z.array(z.record(z.string(), z.unknown())).max(100000),
        feedback: z.array(z.record(z.string(), z.unknown())).max(100000),
      }).parse(await loadSnapshot(body.id, req.user!.id));
      for (const kind of ["scans", "reports", "feedback"] as const) {
        const table = tables[kind].name;
        for (const row of data[kind]) {
          z.string().uuid().parse(row.id);
          if (row.user_id !== req.user!.id) throw new BackupError("Snapshot contains records that do not belong to this account.");
          if (row.deleted_at) continue;
          // Active rows are never overwritten. Tombstones are restored without replacing current content.
          const existing = await client.query(`SELECT user_id,deleted_at FROM ${table} WHERE id=$1 FOR UPDATE`, [row.id]);
          if (existing.rows[0]) {
            if (existing.rows[0].user_id !== req.user!.id) continue;
            if (existing.rows[0].deleted_at) {
              await client.query(`UPDATE ${table} SET deleted_at=NULL,updated_at=now() WHERE id=$1`, [row.id]); restored++;
            }
          } else {
            row.deleted_at = null; row.updated_at = new Date().toISOString();
            const inserted = await client.query(`INSERT INTO ${table} SELECT * FROM jsonb_populate_record(NULL::${table},$1::jsonb) ON CONFLICT(id) DO NOTHING RETURNING id`,
              [JSON.stringify(row)]);
            restored += inserted.rowCount || 0;
          }
        }
      }
    }
    await client.query("INSERT INTO recovery_audit(actor_id,actor_role,action,record_kind,record_id,restored_count) VALUES($1,$2,$3,$4,$5,$6)",
      [req.user!.id, role, body.action === "record" ? "restore-record" : "restore-snapshot", body.kind || null, body.id, restored]);
    await client.query("COMMIT");
    res.json({ restored, message: restored ? `${restored} record(s) restored. Active records were not overwritten.` : "No deleted or missing records were found in your permitted scope." });
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); next(error); }
  finally { await client.query("ROLLBACK").catch(() => undefined); client.release(); }
});
export default router;
