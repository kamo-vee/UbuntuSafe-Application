import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../..", ".env"), quiet: true });
const { checkEmailConnection, checkSmsConnection } = await import("./lib/email.js");
const { default: OpenAI } = await import("openai");
async function checkAI() {
  if (!process.env.OPENAI_API_KEY) return { status: "not_configured" };
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 45000, maxRetries: 0 });
    const response = await client.chat.completions.create({
      model: "gpt-5-mini", reasoning_effort: "low", max_completion_tokens: 2000,
      messages: [{ role: "user", content: "Reply with OK only." }],
    });
    return { status: response.choices[0]?.message.content?.trim() ? "connected" : "empty_result" };
  } catch (error) {
    return { status: "failed", httpStatus: error instanceof OpenAI.APIError ? error.status : undefined,
      code: error instanceof OpenAI.APIError ? error.code : "connection_failed" };
  }
}
const [ai, email, sms] = await Promise.all([checkAI(), checkEmailConnection(), checkSmsConnection()]);
console.log(JSON.stringify({ ai, email, sms }, null, 2));
