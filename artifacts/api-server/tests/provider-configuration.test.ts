import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import OpenAI from "openai";
import { spawnSync } from "node:child_process";
import { aiFailure, aiModels, createAIClient, ProviderError } from "../src/lib/ai-provider.js";
import { emailConfig, smsConfig } from "../src/lib/provider-config.js";
import { deliveryArguments } from "../src/lib/delivery-arguments.js";
import { checkSmsConnection, sendConnectionTestSms } from "../src/lib/email.js";

const names = ["OPENAI_API_KEY", "OPENAI_SCAN_MODEL", "OPENAI_VISION_MODEL", "OPENAI_TRANSCRIPTION_MODEL",
  "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM",
  "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"];
const original = Object.fromEntries(names.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
beforeEach(() => { for (const name of names) delete process.env[name]; });
afterEach(() => {
  for (const name of names) {
    if (original[name] === undefined) delete process.env[name];
    else process.env[name] = original[name];
  }
  globalThis.fetch = originalFetch;
});
const gmail = () => Object.assign(process.env, {
  SMTP_HOST: "smtp.gmail.com", SMTP_PORT: "465", SMTP_SECURE: "true",
  SMTP_USER: "fixture@example.test", SMTP_PASS: "abcd efgh ijkl mnop", EMAIL_FROM: "fixture@example.test",
});
const sms = () => Object.assign(process.env, {
  TWILIO_ACCOUNT_SID: "AC" + "a".repeat(32), TWILIO_AUTH_TOKEN: "b".repeat(32), TWILIO_FROM_NUMBER: "+27110000000",
});

test("AI configuration is server-only and missing credentials cannot silently become a successful scan", () => {
  assert.throws(createAIClient, (error) => error instanceof ProviderError && error.code === "AI_NOT_CONFIGURED");
  assert.deepEqual(aiModels(), { scan: "gpt-5-mini", vision: "gpt-5-mini", transcription: "gpt-4o-mini-transcribe" });
  process.env.OPENAI_TRANSCRIPTION_MODEL = "whisper-1";
  assert.equal(aiModels().transcription, "whisper-1");
});
test("AI quota, invalid-key, model-access and rate-limit errors remain distinct and redact private provider messages", () => {
  for (const [status, code, type, expected] of [
    [429, "credit_balance_exhausted", "insufficient_quota", "AI_CREDIT_REQUIRED"],
    [401, "invalid_api_key", "invalid_request_error", "AI_KEY_REJECTED"],
    [403, "access_denied", "invalid_request_error", "AI_MODEL_ACCESS"],
    [429, "rate_limit_exceeded", "rate_limit_error", "AI_RATE_LIMITED"],
  ] as const) {
    const error = new OpenAI.APIError(status, { code, type, message: "private provider credential" }, undefined, new Headers());
    const safe = aiFailure(error);
    assert.equal(safe.code, expected);
    assert.equal(safe.statusCode, 503);
    assert.ok(!safe.message.includes("private provider credential"));
  }
  assert.ok(!aiFailure(new Error("private provider credential")).message.includes("private provider credential"));
});
test("Gmail implicit TLS and grouped Google app passwords are supported", () => {
  gmail();
  const config = emailConfig();
  assert.equal(config.port, 465);
  assert.equal(config.secure, true);
  assert.equal(config.pass, "abcdefghijklmnop");
});
test("Gmail STARTTLS is required on port587 and incorrect TLS combinations fail clearly", () => {
  gmail();
  process.env.SMTP_PORT = "587"; process.env.SMTP_SECURE = "false";
  assert.equal(emailConfig().requireTLS, true);
  process.env.SMTP_SECURE = "true";
  assert.throws(emailConfig, (error) => error instanceof ProviderError && error.code === "EMAIL_TLS_CONFIGURATION");
});
test("missing email settings, invalid ports and ordinary Gmail passwords fail without connecting", () => {
  assert.throws(emailConfig, ProviderError);
  gmail();
  process.env.SMTP_PASS = "not-a-google-app-password";
  assert.throws(emailConfig, (error) => error instanceof ProviderError && error.code === "GMAIL_APP_PASSWORD_REQUIRED");
  process.env.SMTP_PORT = "not-a-port";
  assert.throws(emailConfig, ProviderError);
});
test("direct Twilio configuration rejects missing values, API-key SIDs and noninternational senders", () => {
  assert.throws(smsConfig, ProviderError);
  sms();
  assert.ok(smsConfig().sid.startsWith("AC"));
  process.env.TWILIO_ACCOUNT_SID = "SK" + "a".repeat(32);
  assert.throws(smsConfig, ProviderError);
  sms(); process.env.TWILIO_FROM_NUMBER = "0110000000";
  assert.throws(smsConfig, ProviderError);
});
test("Twilio sender and explicit test-message contracts work without a managed connector", async () => {
  sms();
  globalThis.fetch = async (input, init) => {
    assert.ok(String(input).startsWith("https://api.twilio.com/2010-04-01/Accounts/AC"));
    if (String(input).includes("IncomingPhoneNumbers")) return new Response(JSON.stringify({ incoming_phone_numbers: [{ capabilities: { sms: true } }] }));
    assert.equal(init?.method, "POST");
    assert.ok(String(init?.body).includes("connection+test"));
    assert.ok(!String(init?.body).includes("password+reset+code%3A"));
    return new Response(JSON.stringify({ status: "queued" }), { status: 201 });
  };
  assert.equal((await checkSmsConnection()).status, "sender_validated");
  await sendConnectionTestSms("+27820000000");
});
test("delivery tests require explicit consent and valid recipients", () => {
  assert.throws(() => deliveryArguments([]));
  assert.throws(() => deliveryArguments(["--email-to", "fixture@example.test"]));
  assert.throws(() => deliveryArguments(["--confirm-send", "--email-to", "not-an-email"]));
  assert.throws(() => deliveryArguments(["--confirm-send", "--sms-to", "0820000000"]));
  assert.throws(() => deliveryArguments(["--confirm-send", "--email-to"]));
  assert.deepEqual(deliveryArguments(["--confirm-send", "--email-to", "fixture@example.test"]), { email: "fixture@example.test", phone: undefined });
});
test("provider checker exits unsuccessfully when services are missing without making external requests", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "src/validate-services.ts"], {
    cwd: process.cwd(), encoding: "utf8",
    env: { ...process.env, OPENAI_API_KEY: "", SMTP_HOST: "", EMAIL_FROM: "",
      TWILIO_ACCOUNT_SID: "", TWILIO_AUTH_TOKEN: "", TWILIO_FROM_NUMBER: "" },
    timeout: 15000,
  });
  assert.equal(result.status, 1);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ai.status, "not_configured");
  assert.equal(output.email.status, "not_configured");
  assert.equal(output.sms.status, "not_configured");
});
