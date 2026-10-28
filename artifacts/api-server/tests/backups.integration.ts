/** Real development PostgreSQL; isolated encrypted vault and synthetic accounts. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm, readFile, writeFile, readdir, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { Readable } from "node:stream";
import pg from "pg";
import dotenv from "dotenv";
dotenv.config({ path: resolve(process.cwd(), "../../.env"), quiet: true });
if (process.env.NODE_ENV === "production") throw new Error("Use a development database only.");
const vault = await mkdtemp(join(tmpdir(), "ubuntusafe-backup-test-"));
process.env.BACKUP_DIRECTORY = vault;
process.env.BACKUP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.BACKUP_ENABLED = "true";
process.env.SESSION_SECRET = "fixture-backup-session-" + randomUUID();
const { pool } = await import("@workspace/db");
const { signToken } = await import("../src/lib/crypto.js");
const { backupPath, saveEncrypted, loadSnapshot, listBackupFiles, decryptToFile } = await import("../src/lib/backup-vault.js");
const { createDatabaseBackup, createPersonalSnapshot, restoreDatabaseToEmptyTarget, runAutomaticBackups } = await import("../src/lib/database-backup.js");
const net = createServer();
await new Promise<void>(done => net.listen(0, "127.0.0.1", done));
const port = (net.address() as { port: number }).port;
await new Promise<void>(done => net.close(() => done()));
const migrations = (await readdir(resolve(process.cwd(), "../../lib/migrations"))).filter(file => file.endsWith(".sql")).sort();
for (const name of migrations) await pool.query(await readFile(resolve(process.cwd(), "../../lib/migrations", name), "utf8"));
const user = randomUUID(), other = randomUUID(), scan = randomUUID();
const report = randomUUID(), feedback = randomUUID(), removedAccount = randomUUID();
const recoveryDatabase = "us_recovery_" + randomUUID().replaceAll("-", "");
let recoveryCreated = false;
const token = (id: string, role?: "admin") => signToken({ userId: id, email: "fixture@example.test", exp: Date.now() + 3600000, sessionVersion: 0, ...(role ? { role } : {}) });
const userToken = token(user), otherToken = token(other), adminToken = token("fixture-admin", "admin");
const server = spawn(process.execPath, ["dist/index.mjs"], { env: { ...process.env, PORT: String(port), BACKUP_ENABLED: "false" }, stdio: "ignore" });
const request = (path: string, auth?: string, body?: unknown, method = body ? "POST" : "GET") =>
  fetch(`http://127.0.0.1:${port}/api${path}`, { method, headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
let passed = 0;
const check = (message: string) => { passed++; console.log("PASS " + message); };
try {
  for (const id of [user, other, removedAccount])
    await pool.query("INSERT INTO ubuntu_users(id,full_name,email,email_verified_at) VALUES($1,'Backup fixture',$2,now())", [id, `backup-${id}@example.test`]);
  await pool.query("INSERT INTO scans(id,user_id,kind,content,status,title,detail) VALUES($1,$2,'message','Fixture private scan','safe','Fixture title','Fixture detail')", [scan, user]);
  await pool.query("INSERT INTO community_reports(id,user_id,category,details) VALUES($1,$2,'other','Fixture report')", [report, user]);
  await pool.query("INSERT INTO community_feedback(id,user_id,message) VALUES($1,$2,'Fixture feedback')", [feedback, user]);
  for (let n = 0; n < 100; n++) {
    if ((await request("/healthz").catch(() => null))?.ok) break;
    await new Promise(done => setTimeout(done, 100));
  }
  assert.equal((await request("/healthz")).status, 200);
  assert.equal((await request("/backup")).status, 401);
  assert.equal((await request("/backup/database", userToken, {})).status, 403);
  assert.equal((await request("/backup", adminToken)).status, 200);
  assert.equal((await request("/backup/snapshot", adminToken, {})).status, 403);
  check("authentication and user/admin backup boundaries");

  const personal = await createPersonalSnapshot(user);
  const encrypted = await readFile(backupPath(personal.id, user));
  assert.equal(encrypted.includes(Buffer.from("Fixture private scan")), false);
  assert.equal((await loadSnapshot(personal.id, user) as { owner: string }).owner, user);
  await assert.rejects(loadSnapshot(personal.id, other));
  assert.equal((await request("/backup", otherToken)).status, 200);
  const otherOverview = await (await request("/backup", otherToken)).json();
  assert.equal(otherOverview.snapshots.length, 0);
  check("encrypted personal snapshots exclude other owners and hide plaintext");

  const originalKey = process.env.BACKUP_ENCRYPTION_KEY;
  process.env.BACKUP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  await assert.rejects(loadSnapshot(personal.id, user));
  process.env.BACKUP_ENCRYPTION_KEY = originalKey;
  const corrupt = Buffer.from(encrypted); corrupt[20] ^= 1;
  await writeFile(backupPath(personal.id, user), corrupt);
  await assert.rejects(loadSnapshot(personal.id, user));
  await writeFile(backupPath(personal.id, user), encrypted);
  assert.equal((await readdir(vault)).some(file => file.endsWith(".restore-partial")), false);
  check("wrong keys and tampered ciphertext fail authentication and clean temporary plaintext");

  assert.equal((await request(`/scans/${scan}`, userToken, undefined, "DELETE")).status, 204);
  assert.equal((await (await request("/activities", userToken)).json()).some((row: { id: string }) => row.id === scan), false);
  const hidden = await (await request("/backup", otherToken)).json();
  assert.equal(hidden.deleted.some((row: { id: string }) => row.id === scan), false);
  const forbidden = await (await request("/backup/restore", otherToken, { action: "record", kind: "scans", id: scan })).json();
  assert.equal(forbidden.restored, 0);
  const recovered = await (await request("/backup/restore", userToken, { action: "record", kind: "scans", id: scan })).json();
  assert.equal(recovered.restored, 1);
  assert.equal((await (await request("/activities", userToken)).json()).some((row: { id: string }) => row.id === scan), true);
  check("deleted scans disappear from history, remain private and restore to live history");

  await pool.query("UPDATE scans SET title='Newer active title' WHERE id=$1", [scan]);
  await pool.query("DELETE FROM community_reports WHERE id=$1", [report]);
  await pool.query("UPDATE community_feedback SET deleted_at=now() WHERE id=$1", [feedback]);
  const restored = await (await request("/backup/restore", userToken, { action: "snapshot", id: personal.id })).json();
  assert.equal(restored.restored, 2);
  assert.equal((await pool.query("SELECT title FROM scans WHERE id=$1", [scan])).rows[0].title, "Newer active title");
  assert.equal((await pool.query("SELECT deleted_at FROM community_feedback WHERE id=$1", [feedback])).rows[0].deleted_at, null);
  const restoreOther = await request("/backup/restore", otherToken, { action: "snapshot", id: personal.id });
  assert.notEqual(restoreOther.status, 200);
  check("snapshot restore recovers missing/deleted records without overwriting active records");

  await pool.query("UPDATE ubuntu_users SET deleted_at=now() WHERE id=$1", [removedAccount]);
  assert.equal((await request("/backup/restore", userToken, { action: "record", kind: "users", id: removedAccount })).status, 403);
  const restoredAccount = await (await request("/backup/restore", adminToken, { action: "record", kind: "users", id: removedAccount })).json();
  assert.equal(restoredAccount.restored, 1);
  assert.equal((await pool.query("SELECT session_version FROM ubuntu_users WHERE id=$1", [removedAccount])).rows[0].session_version, 1);
  assert.ok(Number((await pool.query("SELECT count(*) FROM recovery_audit WHERE actor_id=$1", [user])).rows[0].count) >= 2);
  check("only admin restores accounts, old sessions expire and recovery actions are audited");

  await assert.rejects(restoreDatabaseToEmptyTarget(randomUUID(), process.env.DATABASE_URL!));
  const full = await createDatabaseBackup();
  assert.ok(full.bytes > 32);
  const dumpPath = join(vault, "verified.dump");
  await decryptToFile(full.id, dumpPath);
  assert.equal((await readFile(dumpPath)).subarray(0, 5).toString(), "PGDMP");
  await pool.query(`CREATE DATABASE "${recoveryDatabase}"`);
  recoveryCreated = true;
  const target = new URL(process.env.DATABASE_URL!); target.pathname = "/" + recoveryDatabase;
  await restoreDatabaseToEmptyTarget(full.id, target.toString());
  const recoveredDb = new pg.Client({ connectionString: target.toString() });
  await recoveredDb.connect();
  try {
    assert.equal((await recoveredDb.query("SELECT title FROM scans WHERE id=$1", [scan])).rows[0].title, "Newer active title");
    assert.equal((await recoveredDb.query("SELECT session_version FROM ubuntu_users WHERE id=$1", [user])).rows[0].session_version, 1);
    assert.equal(Number((await recoveredDb.query("SELECT count(*) FROM password_reset_tokens")).rows[0].count), 0);
  } finally { await recoveredDb.end(); }
  await assert.rejects(restoreDatabaseToEmptyTarget(full.id, target.toString()));
  check("real pg_dump/encryption/pg_restore round trip restores into an empty database only and revokes user sessions");

  const before = (await listBackupFiles()).length;
  process.env.PG_DUMP_PATH = join(vault, "missing-pg-dump");
  await assert.rejects(createDatabaseBackup());
  assert.equal((await listBackupFiles()).length, before);
  assert.equal((await readdir(vault)).some(file => file.endsWith(".partial")), false);
  delete process.env.PG_DUMP_PATH;
  const small = await saveEncrypted(Readable.from(["fixture"]));
  assert.ok(small.id);
  check("failed database tools publish no successful backup or unfinished encrypted file");
  const old = new Date(Date.now() - 32 * 86400000);
  await utimes(backupPath(full.id), old, old);
  await utimes(backupPath(small.id), old, old);
  await utimes(backupPath(personal.id, user), old, old);
  await runAutomaticBackups();
  const automatic = await listBackupFiles();
  assert.equal(automatic.length, 1);
  assert.notEqual(automatic[0].id, full.id);
  const personalAutomatic = await listBackupFiles(user);
  assert.equal(personalAutomatic.length, 1);
  assert.notEqual(personalAutomatic[0].id, personal.id);
  await runAutomaticBackups();
  assert.equal((await listBackupFiles())[0].id, automatic[0].id);
  assert.equal((await listBackupFiles(user))[0].id, personalAutomatic[0].id);
  check("automatic due backups cover database and users, prune old files and skip already-current backups");
  console.log(`All ${passed} backup integration groups passed. Temporary encrypted backups and recovery database are removed.`);
} finally {
  server.kill();
  if (recoveryCreated) {
    await pool.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1", [recoveryDatabase]);
    await pool.query(`DROP DATABASE IF EXISTS "${recoveryDatabase}"`);
  }
  await pool.query("DELETE FROM recovery_audit WHERE actor_id IN ($1,$2,$3)", [user, other, "fixture-admin"]);
  await pool.query("DELETE FROM community_feedback WHERE user_id IN ($1,$2,$3)", [user, other, removedAccount]);
  await pool.query("DELETE FROM community_reports WHERE user_id IN ($1,$2,$3)", [user, other, removedAccount]);
  await pool.query("DELETE FROM scans WHERE user_id IN ($1,$2,$3)", [user, other, removedAccount]);
  await pool.query("DELETE FROM ubuntu_users WHERE id IN ($1,$2,$3)", [user, other, removedAccount]);
  await pool.end();
  await rm(vault, { recursive: true, force: true });
}
