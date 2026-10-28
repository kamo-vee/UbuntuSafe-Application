import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { aiFailure, aiModels, createAIClient, ProviderError, GeminiHttpError } from "../src/lib/ai-provider.js";
import { emailConfig, smsConfig } from "../src/lib/provider-config.js";
import { deliveryArguments } from "../src/lib/delivery-arguments.js";
import { checkSmsConnection, sendConnectionTestSms } from "../src/lib/email.js";

const names = ["GEMINI_API_KEY", "GEMINI_MODEL", "GEMINI_SCAN_MODEL", "GEMINI_VISION_MODEL", "GEMINI_TRANSCRIPTION_MODEL",
  "NODE_ENV", "GEMINI_TEST_BASE_URL",
  "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM",
  "SMS_ENABLED", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"];
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
  SMS_ENABLED: "true",
  TWILIO_ACCOUNT_SID: "AC" + "a".repeat(32), TWILIO_AUTH_TOKEN: "b".repeat(32), TWILIO_FROM_NUMBER: "+27110000000",
});

test("AI configuration is server-only and missing credentials cannot silently become a successful scan", () => {
  assert.throws(createAIClient, (error) => error instanceof ProviderError && error.code === "AI_NOT_CONFIGURED");
  assert.deepEqual(aiModels(), { scan: "gemini-3.1-flash-lite", vision: "gemini-3.1-flash-lite", transcription: "gemini-3.1-flash-lite" });
  process.env.GEMINI_TRANSCRIPTION_MODEL = "gemini-2.5-flash";
  assert.equal(aiModels().transcription, "gemini-2.5-flash");
});
test("Gemini quota, invalid-key, model-access and request errors remain distinct without raw diagnostics", () => {
  for (const [status, code, expected] of [
    [429, "RESOURCE_EXHAUSTED", "AI_RATE_LIMITED"],
    [400, "API_KEY_INVALID", "AI_KEY_REJECTED"],
    [401, "UNAUTHENTICATED", "AI_KEY_REJECTED"],
    [403, "PERMISSION_DENIED", "AI_MODEL_ACCESS"],
    [404, "NOT_FOUND", "AI_MODEL_ACCESS"],
    [400, "INVALID_ARGUMENT", "AI_REQUEST_INVALID"],
    [503, "UNAVAILABLE", "AI_UNAVAILABLE"],
  ] as const) {
    const error = new GeminiHttpError(status, code);
    const safe = aiFailure(error);
    assert.equal(safe.code, expected);
    assert.equal(safe.statusCode, 503);
    assert.ok(!safe.message.includes("private provider credential"));
  }
  assert.ok(!aiFailure(new Error("private provider credential")).message.includes("private provider credential"));
  assert.equal(aiFailure(new DOMException("private diagnostic", "TimeoutError")).code, "AI_TIMEOUT");
});
test("direct Gemini REST uses a private header, structured output and inline media, excluding thought text", async () => {
  process.env.GEMINI_API_KEY = "fixture-only-private-key";
  let calls = 0;
  globalThis.fetch = (async (url, init) => {
    calls++;
    assert.equal(String(url), "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent");
    assert.ok(!String(url).includes("fixture-only-private-key"));
    assert.equal((init?.headers as Record<string, string>)["x-goog-api-key"], "fixture-only-private-key");
    assert.equal(init?.redirect, "error");
    const body = JSON.parse(String(init?.body));
    assert.ok(!String(init?.body).includes("fixture-only-private-key"));
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    assert.deepEqual(body.contents[0].parts[1].inlineData, { mimeType: "image/png", data: "fixture" });
    return new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [
      { thought: true, text: "Never expose internal thought." }, { text: "final result" },
    ] } }] }), { status: 200 });
  }) as typeof fetch;
  const result = await createAIClient().generate({ model: aiModels().scan, prompt: "fixture",
    schema: { type: "OBJECT" }, media: { mimeType: "image/png", data: "fixture" } });
  assert.equal(result, "final result");
  assert.equal(calls, 1);
});
test("Gemini blocked, truncated and malformed responses fail instead of returning partial content", async () => {
  process.env.GEMINI_API_KEY = "fixture-only-key";
  for (const [body, expected] of [
    [{ promptFeedback: { blockReason: "SAFETY" } }, "AI_RESPONSE_BLOCKED"],
    [{ candidates: [{ finishReason: "SAFETY" }] }, "AI_RESPONSE_BLOCKED"],
    [{ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "partial" }] } }] }, "AI_INCOMPLETE_RESPONSE"],
    [{ candidates: [] }, "AI_INCOMPLETE_RESPONSE"],
  ] as const) {
    globalThis.fetch = (async () => new Response(JSON.stringify(body), { status: 200 })) as typeof fetch;
    await assert.rejects(createAIClient().generate({ model: aiModels().scan, prompt: "fixture" }),
      (error) => error instanceof ProviderError && error.code === expected);
  }
});
test("Gemini errors do not retry, leak diagnostics, or fall back to a paid provider", async () => {
  process.env.GEMINI_API_KEY = "fixture-only-key";
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response(JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED", message: "private provider credential" } }), { status: 429 });
  }) as typeof fetch;
  await assert.rejects(createAIClient().generate({ model: aiModels().scan, prompt: "fixture" }),
    (error) => error instanceof ProviderError && error.code === "AI_RATE_LIMITED" && !error.message.includes("private provider credential"));
  assert.equal(calls, 1);
});
test("test endpoints cannot send credentials to nonloopback servers or override production destinations", async () => {
  process.env.GEMINI_API_KEY = "fixture-only-key";
  process.env.GEMINI_TEST_BASE_URL = "http://untrusted.example.test/v1beta";
  process.env.NODE_ENV = "test";
  assert.throws(createAIClient, (error) => error instanceof ProviderError && error.code === "AI_TEST_CONFIGURATION");
  process.env.NODE_ENV = "production";
  globalThis.fetch = (async (url) => {
    assert.ok(String(url).startsWith("https://generativelanguage.googleapis.com/"));
    return new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "OK" }] } }] }));
  }) as typeof fetch;
  assert.equal(await createAIClient().generate({ model: aiModels().scan, prompt: "fixture" }), "OK");
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
test("SMS is disabled by default, ignores old credentials and cannot send or contact Twilio", async () => {
  sms();
  delete process.env.SMS_ENABLED;
  globalThis.fetch = async () => { throw new Error("Disabled SMS must not contact Twilio"); };
  assert.equal((await checkSmsConnection()).status, "disabled");
  await assert.rejects(sendConnectionTestSms("+27820000000"),
    (error) => error instanceof ProviderError && error.code === "SMS_DISABLED");
  process.env.SMS_ENABLED = "false";
  assert.equal((await checkSmsConnection()).status, "disabled");
  process.env.SMS_ENABLED = "true";
  delete process.env.TWILIO_AUTH_TOKEN;
  assert.equal((await checkSmsConnection()).status, "not_configured");
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
    env: { ...process.env, GEMINI_API_KEY: "", SMTP_HOST: "", EMAIL_FROM: "",
      TWILIO_ACCOUNT_SID: "", TWILIO_AUTH_TOKEN: "", TWILIO_FROM_NUMBER: "" },
    timeout: 15000,
  });
  assert.equal(result.status, 1);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ai.status, "not_configured");
  assert.equal(output.email.status, "not_configured");
  assert.equal(output.sms.status, "disabled");
});
