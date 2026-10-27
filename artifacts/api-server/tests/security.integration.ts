/** Real development DB + isolated HTTP/SMTP fixtures. Never claims external delivery. */
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer, type Socket } from "node:net";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: resolve(process.cwd(), "../../.env"), quiet: true });
if (process.env.NODE_ENV === "production") throw new Error("Integration fixtures must not run in production.");
const { pool } = await import("@workspace/db");
const ids: string[] = [];
const revoked: string[] = [];
const mail = new Map<string, string>();
const sockets = new Set<Socket>();
let rejectMail = false;
let failAI = false;
let audioRequests = 0;
const smtp = createNetServer((socket) => {
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
  socket.write("220 localhost test SMTP\r\n");
  let pending = "", inData = false, data = "", recipient = "";
  socket.on("data", (chunk) => {
    pending += chunk.toString();
    let end: number;
    while ((end = pending.indexOf("\r\n")) >= 0) {
      const line = pending.slice(0, end);
      pending = pending.slice(end + 2);
      if (inData) {
        if (line === ".") {
          const code = data.replace(/=\r?\n/g, "").match(/(?:verification code is|reset code is) (\d{6})/)?.[1];
          if (code) mail.set(recipient, code);
          inData = false; data = "";
          socket.write("250 Message accepted\r\n");
        } else data += line + "\r\n";
      } else if (/^EHLO|^HELO/i.test(line)) socket.write("250-localhost\r\n250 PIPELINING\r\n");
      else if (/^MAIL FROM:/i.test(line)) socket.write("250 OK\r\n");
      else if (/^RCPT TO:/i.test(line)) {
        recipient = line.match(/<([^>]+)>/)?.[1] ?? "";
        socket.write(rejectMail ? "550 Recipient rejected for fixture test\r\n" : "250 OK\r\n");
      } else if (/^DATA/i.test(line)) { inData = true; socket.write("354 End with dot\r\n"); }
      else if (/^QUIT/i.test(line)) { socket.end("221 Bye\r\n"); }
      else socket.write("250 OK\r\n");
    }
  });
});
const ai = createHttpServer(async (req, res) => {
  let payload = "";
  for await (const chunk of req) payload += chunk;
  res.setHeader("Content-Type", "application/json");
  if (failAI) {
    res.writeHead(401);
    res.end(JSON.stringify({ error: { message: "Fixture rejected credential", code: "invalid_api_key", type: "invalid_request_error" } }));
    return;
  }
  if (req.url?.endsWith("/audio/transcriptions")) {
    audioRequests++;
    assert.ok(payload.includes("voice-note.wav"));
    res.end(JSON.stringify({ text: "Urgent, send money and your OTP now." }));
  } else {
    const body = JSON.parse(payload);
    const content = body.response_format
      ? JSON.stringify({ status: "safe", detail: "Fixture lower-risk response, which must not downgrade deterministic danger." })
      : "Urgent, send money and your OTP now.";
    res.end(JSON.stringify({ id: "fixture", choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }] }));
  }
});
const listen = (server: ReturnType<typeof createNetServer> | ReturnType<typeof createHttpServer>) =>
  new Promise<number>((done) => server.listen(0, "127.0.0.1", () => done((server.address() as { port: number }).port)));
const smtpPort = await listen(smtp);
const aiPort = await listen(ai);
const reservation = createNetServer();
const apiPort = await listen(reservation);
await new Promise<void>((done) => reservation.close(() => done()));
const child = spawn(process.execPath, ["dist/index.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(apiPort), SMTP_HOST: "127.0.0.1", SMTP_PORT: String(smtpPort),
    SMTP_SECURE: "false", SMTP_USER: "", SMTP_PASS: "", EMAIL_FROM: "fixture@example.test",
    OPENAI_API_KEY: "fixture-only-key", OPENAI_BASE_URL: `http://127.0.0.1:${aiPort}/v1`,
    UBUNTUSAFE_ADMIN_EMAIL: "fixture-admin@example.test", UBUNTUSAFE_ADMIN_PASSWORD: "AdminFixtureOnly!7319",
    TWILIO_ACCOUNT_SID: "", TWILIO_AUTH_TOKEN: "", TWILIO_FROM_NUMBER: "" },
  stdio: ["ignore", "ignore", "ignore"],
});
const base = `http://127.0.0.1:${apiPort}/api`;
const password = "FixtureOnly!4829";
const request = (path: string, token?: string, body?: unknown, method = body ? "POST" : "GET") =>
  fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
let passed = 0;
const check = (name: string) => { passed++; console.log(`PASS ${name}`); };
async function register() {
  const email = `fixture-${randomUUID()}@example.test`;
  const response = await request("/auth/register", undefined, { fullName: "Fixture", surname: "Check", dateOfBirth: "1995-01-01", email, password });
  assert.equal(response.status, 201);
  const result = await response.json();
  ids.push(result.user.id);
  return { ...result, email };
}
async function login(email: string, secret = password) {
  const response = await request("/auth/login", undefined, { email, password: secret });
  assert.equal(response.status, 200);
  return (await response.json()).token as string;
}
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error("Isolated API exited before startup");
    if ((await fetch(base + "/healthz").catch(() => null))?.ok) break;
    await new Promise((done) => setTimeout(done, 100));
  }
  assert.equal((await fetch(base + "/healthz")).status, 200);
  const account = await register();
  assert.equal(account.verificationRequired, true);
  assert.equal(account.verificationEmailSent, true);
  assert.ok(mail.get(account.email));
  assert.equal((await request("/scan", account.token, { kind: "message", content: "test pending account" })).status, 403);
  const pendingLogin = await request("/auth/login", undefined, { email: account.email, password });
  assert.equal(pendingLogin.status, 403);
  assert.equal((await pendingLogin.json()).code, "EMAIL_UNVERIFIED");
  check("new accounts receive verification email and cannot bypass verification");
  const code = mail.get(account.email)!;
  assert.equal((await request("/auth/email-verification/request", undefined, { email: account.email })).status, 429);
  assert.equal((await request("/auth/email-verification/confirm", undefined, { email: account.email, code: code === "000000" ? "111111" : "000000" })).status, 400);
  assert.equal(Number((await pool.query("SELECT attempts FROM email_verification_tokens WHERE user_id=$1", [account.user.id])).rows[0].attempts), 1);
  assert.equal((await request("/auth/email-verification/confirm", undefined, { email: account.email, code })).status, 200);
  assert.equal((await request("/auth/email-verification/confirm", undefined, { email: account.email, code })).status, 400);
  check("verification cooldown, persistent failed attempts, confirmation and single use");
  const token = await login(account.email);
  const scan = await request("/scan", token, { kind: "message", content: "Urgent: send money and share your OTP now" });
  assert.equal(scan.status, 201);
  const result = await scan.json();
  assert.equal(result.status, "danger");
  assert.equal(result.riskScore, 90);
  assert.ok(result.suspiciousIndicators.length && result.recommendedActions.length);
  assert.ok(!result.detail.includes("Fixture lower-risk"));
  assert.equal(Number((await pool.query("SELECT count(*) FROM scans WHERE user_id=$1", [account.user.id])).rows[0].count), 1);
  check("real API scan persistence, verdict fields and AI cannot downgrade danger (fixture provider)");
  const images = resolve(process.cwd(), "../ubuntusafe-mobile/assets/images");
  const pngName = (await readdir(images)).find((name) => name.endsWith(".png"))!;
  const imageBase64 = (await readFile(resolve(images, pngName))).toString("base64");
  assert.equal((await request("/screen/ocr", token, { imageBase64, mimeType: "image/png" })).status, 200);
  const wav = Buffer.alloc(128);
  wav.write("RIFF"); wav.write("WAVE", 8);
  const audio = await request("/audio/transcribe", token, { audioBase64: wav.toString("base64"), mimeType: "audio/wav" });
  assert.equal(audio.status, 200);
  assert.ok((await audio.json()).text);
  assert.equal(audioRequests, 1);
  assert.equal((await request("/audio/transcribe", token, { audioBase64: Buffer.alloc(128, 65).toString("base64"), mimeType: "audio/wav" })).status, 400);
  check("OCR/audio request contracts, audio filename, and invalid-media rejection (fixture provider)");
  failAI = true;
  assert.equal((await request("/scan", token, { kind: "message", content: "Review this message please" })).status, 503);
  failAI = false;
  assert.equal(Number((await pool.query("SELECT count(*) FROM scans WHERE user_id=$1", [account.user.id])).rows[0].count), 1);
  check("provider failure is explicit and does not save a fake result");
  const other = await register();
  await request("/auth/email-verification/confirm", undefined, { email: other.email, code: mail.get(other.email) });
  const otherToken = await login(other.email);
  const now = new Date().toISOString();
  assert.equal((await request("/sync", otherToken, {
    scans: [{ id: result.id, kind: "message", content: "Foreign overwrite attempt", status: "safe", title: "Foreign", detail: "Foreign", createdAt: now, updatedAt: now, deletedAt: null, deviceId: "fixture-device" }], reports: [],
  })).status, 200);
  assert.equal((await pool.query("SELECT user_id, content FROM scans WHERE id=$1", [result.id])).rows[0].user_id, account.user.id);
  assert.notEqual((await pool.query("SELECT content FROM scans WHERE id=$1", [result.id])).rows[0].content, "Foreign overwrite attempt");
  check("sync conflict cannot overwrite another account's data");
  assert.equal((await request("/auth/logout", otherToken, {})).status, 204);
  revoked.push(createHash("sha256").update(otherToken).digest("hex"));
  assert.equal((await request("/auth/me", otherToken)).status, 401);
  check("logout revokes the exact session token");
  const adminResponse = await request("/auth/admin-login", undefined, {
    email: "fixture-admin@example.test", password: "AdminFixtureOnly!7319",
  });
  assert.equal(adminResponse.status, 200);
  const adminToken = (await adminResponse.json()).token;
  assert.equal((await request("/admin/records", adminToken)).status, 200);
  assert.equal((await request("/auth/me", adminToken)).status, 403);
  assert.equal((await request("/auth/logout", adminToken, {})).status, 204);
  revoked.push(createHash("sha256").update(adminToken).digest("hex"));
  assert.equal((await request("/admin/records", adminToken)).status, 401);
  check("administrator role restrictions and exact-token logout revocation");
  assert.equal((await request("/auth/forgot-password", undefined, { channel: "email", destination: account.email })).status, 202);
  await pool.query("UPDATE password_reset_tokens SET attempts=4 WHERE user_id=$1", [account.user.id]);
  const resetCode = mail.get(account.email)!;
  const resetBody = { channel: "email", destination: account.email, password: "ChangedFixture!9302" };
  assert.equal((await request("/auth/reset-password", undefined, { ...resetBody, code: "000000" })).status, 400);
  assert.equal(Number((await pool.query("SELECT attempts FROM password_reset_tokens WHERE user_id=$1", [account.user.id])).rows[0].attempts), 5);
  assert.equal((await request("/auth/reset-password", undefined, { ...resetBody, code: resetCode })).status, 400);
  await pool.query("UPDATE password_reset_tokens SET created_at=now()-interval '61 seconds' WHERE user_id=$1", [account.user.id]);
  assert.equal((await request("/auth/forgot-password", undefined, { channel: "email", destination: account.email })).status, 202);
  assert.equal((await request("/auth/reset-password", undefined, { ...resetBody, code: mail.get(account.email) })).status, 204);
  assert.equal((await request("/auth/me", token)).status, 401);
  assert.equal(Number((await pool.query("SELECT count(*) FROM password_reset_tokens WHERE user_id=$1", [account.user.id])).rows[0].count), 0);
  await login(account.email, resetBody.password);
  check("reset attempt exhaustion, fresh-code recovery, single use, and all old sessions invalidated");
  const expired = await register();
  await pool.query("UPDATE email_verification_tokens SET expires_at=now()-interval '1 second' WHERE user_id=$1", [expired.user.id]);
  assert.equal((await request("/auth/email-verification/confirm", undefined, { email: expired.email, code: mail.get(expired.email) })).status, 400);
  await pool.query("UPDATE email_verification_tokens SET expires_at=now()+interval '10 minutes', attempts=4 WHERE user_id=$1", [expired.user.id]);
  assert.equal((await request("/auth/email-verification/confirm", undefined, { email: expired.email, code: "000000" })).status, 400);
  assert.equal((await request("/auth/email-verification/confirm", undefined, { email: expired.email, code: mail.get(expired.email) })).status, 400);
  check("verification expiration and five-attempt exhaustion");
  await pool.query("UPDATE ubuntu_users SET email_verification_required=false WHERE id=$1", [expired.user.id]);
  await login(expired.email);
  check("legacy-account policy preserves access without falsely marking email verified");
  rejectMail = true;
  const failed = await register();
  assert.equal(failed.verificationEmailSent, false);
  assert.equal(Number((await pool.query("SELECT count(*) FROM email_verification_tokens WHERE user_id=$1", [failed.user.id])).rows[0].count), 0);
  assert.equal((await request("/auth/email-verification/request", undefined, { email: failed.email })).status, 503);
  check("rejected email remains pending, removes unusable code, and reports provider failure");
  console.log(`All ${passed} integration groups passed. Providers were controlled fixtures, not real delivery.`);
} finally {
  child.kill("SIGTERM");
  for (const socket of sockets) socket.destroy();
  await Promise.all([new Promise<void>((done) => smtp.close(() => done())), new Promise<void>((done) => ai.close(() => done()))]);
  if (ids.length) {
    await pool.query("DELETE FROM scans WHERE user_id=ANY($1::uuid[])", [ids]);
    await pool.query("DELETE FROM ubuntu_users WHERE id=ANY($1::uuid[])", [ids]);
  }
  if (revoked.length) await pool.query("DELETE FROM revoked_auth_tokens WHERE token_hash=ANY($1::text[])", [revoked]);
  await pool.end();
}
