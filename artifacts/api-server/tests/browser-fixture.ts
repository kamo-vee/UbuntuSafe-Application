/** Development-only CLI for browser tests. No production endpoint or auth bypass. */
import dotenv from "dotenv";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
dotenv.config({ path: resolve(process.cwd(), "../../.env"), quiet: true });
if (process.env.NODE_ENV === "production") throw new Error("Browser fixtures are development-only.");
const { pool } = await import("@workspace/db");
const { registerUser } = await import("../src/lib/auth.js");
const { verificationHash } = await import("../src/lib/email-verification.js");
const requested = process.argv[process.argv.indexOf("--email") + 1]?.trim().toLowerCase();
const existingEmail = process.argv.includes("--email") ? requested : undefined;
if (existingEmail && !/^browser-[a-z0-9-]+@example\.test$/i.test(existingEmail)) throw new Error("Only synthetic browser fixture addresses are allowed.");
const email = existingEmail ?? `browser-${randomUUID()}@example.test`;
const user = existingEmail
  ? (await pool.query("SELECT id FROM ubuntu_users WHERE email=$1 AND email_verification_required=true AND email_verified_at IS NULL", [email])).rows[0]
  : (await registerUser("Browser", "Fixture", "1995-01-01", email, null, "BrowserFixture!4829")).user;
if (!user) throw new Error("Pending synthetic fixture account not found.");
await pool.query(
  "INSERT INTO email_verification_tokens(user_id, token_hash, expires_at) VALUES($1,$2,now()+interval '10 minutes') ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash, expires_at=excluded.expires_at, attempts=0, created_at=now()",
  [user.id, verificationHash(user.id, "648291")],
);
console.log(JSON.stringify({ email, fixtureId: user.id }));
await pool.end();
