/** Isolated AI/SMTP fixtures; never sends real email or changes existing accounts. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer as httpServer } from "node:http";
import { createServer as netServer, type Server, type Socket } from "node:net";
import { resolve } from "node:path";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
dotenv.config({ path: resolve(process.cwd(), "../../.env"), quiet: true });
if (process.env.NODE_ENV === "production") throw new Error("Development fixtures only.");
const { pool } = await import("@workspace/db");
const { signToken } = await import("../src/lib/crypto.js");
const { southAfricanWeek, csvCell } = await import("../src/lib/admin-analytics.js");
const unique = randomUUID(), user = randomUUID(), other = randomUUID();
const password = "FixtureTesting!4829";
const email = `upgrade-${unique}@example.test`, newEmail = `admin-upgrade-${unique}@example.test`;
let addedAdmin: string | undefined, rejectMail = false, smtpRecipient = "", message = "";
const sockets = new Set<Socket>();
const smtp = netServer(socket => {
  sockets.add(socket); socket.on("close", () => sockets.delete(socket));
  socket.write("220 fixture ESMTP\r\n");
  let pending = "", data = false;
  socket.on("data", chunk => {
    pending += chunk.toString();
    while (pending.includes("\r\n")) {
      const end = pending.indexOf("\r\n"), line = pending.slice(0, end); pending = pending.slice(end + 2);
      if (data) {
        if (line === ".") { data = false; socket.write("250 accepted\r\n"); }
        else message += line + "\r\n";
      } else if (/^(EHLO|HELO)/i.test(line)) socket.write("250-fixture\r\n250 PIPELINING\r\n");
      else if (/^RCPT TO:/i.test(line)) { smtpRecipient = line.match(/<([^>]+)>/)?.[1] ?? ""; socket.write(rejectMail ? "550 rejected\r\n" : "250 OK\r\n"); }
      else if (/^DATA/i.test(line)) { data = true; socket.write("354 send data\r\n"); }
      else if (/^QUIT/i.test(line)) socket.end("221 bye\r\n");
      else socket.write("250 OK\r\n");
    }
  });
});
const ai = httpServer(async (req, res) => {
  for await (const _chunk of req) { /* consume fixture body */ }
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{
    text: JSON.stringify({ status: "safe", detail: "Fixture analysis completed." }),
  }] } }] }));
});
const listen = (server: Server) => new Promise<number>(done => server.listen(0, "127.0.0.1", () => done((server.address() as { port: number }).port)));
const smtpPort = await listen(smtp), aiPort = await listen(ai), reserve = netServer(), port = await listen(reserve);
await new Promise<void>(done => reserve.close(() => done()));
const child = spawn(process.execPath, ["dist/index.mjs"], { env: {
  ...process.env, PORT: String(port), NODE_ENV: "test", AI_PROVIDER: "gemini", GEMINI_API_KEY: "fixture-only-key",
  GEMINI_TEST_BASE_URL: `http://127.0.0.1:${aiPort}/v1beta`,
  SMTP_HOST: "127.0.0.1", SMTP_PORT: String(smtpPort), SMTP_SECURE: "false", SMTP_USER: "", SMTP_PASS: "",
  EMAIL_FROM: "fixture@example.test", UBUNTUSAFE_ADMIN_EMAIL: "upgrade-root@example.test",
  UBUNTUSAFE_ADMIN_PASSWORD: password, SMS_ENABLED: "false", BACKUP_ENABLED: "false",
}, stdio: "ignore" });
const base = `http://127.0.0.1:${port}/api`;
const request = (path: string, token?: string, body?: unknown) => fetch(base + path, {
  method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
let passed = 0;
const check = (name: string) => { passed++; console.log(`PASS ${name}`); };
try {
  for (let i = 0; i < 100 && !(await request("/healthz").catch(() => null))?.ok; i++) await new Promise(done => setTimeout(done, 100));
  assert.equal((await request("/healthz")).status, 200);
  const bad = await request("/auth/register", undefined, { fullName: "1", surname: "2", dateOfBirth: "2025-02-30", email: "not-email", phone: "123", password: "weak" });
  assert.equal(bad.status, 400);
  const fields = (await bad.json()).fieldErrors;
  for (const key of ["fullName", "surname", "dateOfBirth", "email", "phone", "password"]) assert.ok(fields[key], key);
  check("registration returns a separate human-readable error for every invalid field");
  const hash = await bcrypt.hash(password, 10);
  await pool.query("INSERT INTO ubuntu_users(id,full_name,surname,email,password_hash) VALUES($1,'Upgrade','Tester',$2,$3),($4,'Other','Tester',$5,$3)",
    [user, email, hash, other, `other-${unique}@example.test`]);
  const userToken = await signToken({ userId: user, email, exp: Date.now() + 3600000, sessionVersion: 0 });
  const login = await request("/auth/admin-login", undefined, { email: "upgrade-root@example.test", password });
  assert.equal(login.status, 200);
  const adminToken = (await login.json()).token;
  for (const path of ["/admin/analytics", "/admin/accounts", "/admin/export"]) {
    assert.equal((await request(path)).status, 401);
    assert.equal((await request(path, userToken)).status, 403);
  }
  assert.equal((await request("/admin/accounts", userToken, {})).status, 403);
  const invalidAdmin = await request("/admin/accounts", adminToken, { fullName: "5", surname: "", email: "bad", password: "short" });
  assert.equal(invalidAdmin.status, 400);
  const invalidFields = (await invalidAdmin.json()).fieldErrors;
  for (const key of ["fullName", "surname", "email", "password"]) assert.ok(invalidFields[key], key);
  const created = await request("/admin/accounts", adminToken, { fullName: "Additional", surname: "Admin", email: newEmail, password });
  assert.equal(created.status, 201);
  const account = await created.json(); addedAdmin = account.id;
  assert.equal(account.passwordHash, undefined); assert.equal(account.password, undefined);
  assert.equal((await pool.query("SELECT password_hash <> $2 AS hashed FROM ubuntu_admins WHERE id=$1", [addedAdmin, password])).rows[0].hashed, true);
  assert.equal((await request("/admin/accounts", adminToken, { fullName: "Additional", surname: "Admin", email: newEmail, password })).status, 409);
  const additionalLogin = await request("/auth/admin-login", undefined, { email: newEmail.toUpperCase(), password });
  assert.equal(additionalLogin.status, 200);
  const additionalToken = (await additionalLogin.json()).token;
  assert.equal((await request("/admin/analytics", additionalToken)).status, 200);
  assert.equal((await request("/auth/me", additionalToken)).status, 403);
  check("admin-only validated account creation, duplicate protection, bcrypt storage, and additional-admin sign-in");
  const { start, end } = southAfricanWeek();
  assert.equal(start.getUTCHours(), 22); assert.equal(start.getUTCDay(), 0); assert.equal(end.getTime() - start.getTime(), 7 * 86400000);
  const before = await (await request("/usage/week", userToken)).json();
  assert.equal(before.scans.length, 0);
  for (const tool of ["screen", "voice"]) {
    const scan = await request("/scan", userToken, { kind: tool === "screen" ? "message" : tool, tool, content: "Please verify this ordinary community notice independently." });
    assert.equal(scan.status, 201, await scan.clone().text());
  }
  const offlineId = randomUUID();
  assert.equal((await request("/sync", userToken, { scans: [{ id: offlineId, kind: "message", tool: "screen", content: "Offline screenshot check", status: "safe", title: "Offline", detail: "Local rules",
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deletedAt: null }], reports: [] })).status, 200);
  await pool.query("INSERT INTO scans(user_id,kind,tool,content,status,title,detail,created_at) VALUES($1,'message','message','Earlier scan','safe','Previous week','Earlier', $2),($3,'message','message','Other user','safe','Other','Private',now())", [user, new Date(start.getTime() - 1000), other]);
  await pool.query("INSERT INTO community_reports(user_id,category,details) VALUES($1,'other','=2+3')", [user]);
  await pool.query("INSERT INTO community_feedback(user_id,message) VALUES($1,'Dashboard fixture feedback')", [user]);
  const week = await (await request("/usage/week", userToken)).json();
  assert.equal(week.scans.length, 3);
  assert.equal(week.scans.filter((scan: { tool: string }) => scan.tool === "screen").length, 2);
  const analytics = await (await request("/admin/analytics", adminToken)).json();
  assert.equal(analytics.daily.length, 7); assert.equal(analytics.tools.length, 6);
  assert.equal(analytics.userTools.find((row: { userId: string; tool: string }) => row.userId === user && row.tool === "screen").count, 2);
  assert.ok(analytics.feedback.some((row: { email: string }) => row.email === email));
  assert.ok(analytics.reports.some((row: { email: string }) => row.email === email));
  check("Monday-to-Sunday weekly ownership, screenshot separation, offline sync, and real dashboard aggregations");
  const exported = await request("/admin/export", adminToken);
  assert.equal(exported.status, 200); assert.match(exported.headers.get("content-type")!, /text\/csv/);
  const csv = await exported.text();
  assert.ok(csv.includes(newEmail) === false); assert.ok(csv.includes(email)); assert.ok(csv.includes("\"'=2+3\""));
  assert.equal(csvCell('a,"b"'), '"a,""b"""'); assert.equal(csvCell("\t=2+3"), '"\'\t=2+3"');
  const sent = await request("/admin/export/email", adminToken, { recipient: "untrusted@example.test" });
  assert.equal(sent.status, 202, await sent.clone().text());
  assert.equal(smtpRecipient, "upgrade-root@example.test"); assert.ok(message.includes("UbuntuSafe-admin-report.csv"));
  rejectMail = true;
  assert.equal((await request("/admin/export/email", adminToken, {})).status, 503);
  check("full CSV export, formula-injection protection, fixed administrator recipient, and truthful SMTP failure");
  await pool.query("UPDATE ubuntu_admins SET deleted_at=now() WHERE id=$1", [addedAdmin]);
  assert.equal((await request("/admin/analytics", additionalToken)).status, 401);
  check("removed administrator accounts cannot continue using old sessions");
  console.log(`All ${passed} upgrade integration groups passed. AI and SMTP were local fixtures, not real provider delivery.`);
} finally {
  child.kill("SIGTERM"); for (const socket of sockets) socket.destroy();
  await Promise.all([new Promise<void>(done => smtp.close(() => done())), new Promise<void>(done => ai.close(() => done()))]);
  await pool.query("DELETE FROM scans WHERE user_id=ANY($1::uuid[])", [[user, other]]);
  await pool.query("DELETE FROM community_reports WHERE user_id=ANY($1::uuid[])", [[user, other]]);
  await pool.query("DELETE FROM community_feedback WHERE user_id=ANY($1::uuid[])", [[user, other]]);
  await pool.query("DELETE FROM ubuntu_users WHERE id=ANY($1::uuid[])", [[user, other]]);
  if (addedAdmin) await pool.query("DELETE FROM ubuntu_admins WHERE id=$1", [addedAdmin]);
  await pool.end();
}
