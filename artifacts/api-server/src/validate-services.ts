import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../..", ".env"), quiet: true });
const { checkEmailConnection, checkSmsConnection } = await import("./lib/email.js");
const { aiFailure, aiModels, createAIClient } = await import("./lib/ai-provider.js");
const { default: OpenAI } = await import("openai");
async function checkAI() {
  if (!process.env.OPENAI_API_KEY) return { status: "not_configured" };
  try {
    const client = createAIClient();
    const response = await client.chat.completions.create({
      model: aiModels().scan, reasoning_effort: aiModels().scan.startsWith("gpt-5") ? "low" : undefined, max_completion_tokens: 8192,
      messages: [{ role: "user", content: "Reply with OK only." }],
    });
    return { status: response.choices[0]?.message.content?.trim() ? "connected" : "empty_result" };
  } catch (error) {
    return { status: "failed", httpStatus: error instanceof OpenAI.APIError ? error.status : undefined,
      code: error instanceof OpenAI.APIError ? error.code : "connection_failed",
      action: aiFailure(error).message };
  }
}
const [ai, email, sms] = await Promise.all([checkAI(), checkEmailConnection(), checkSmsConnection()]);
console.log(JSON.stringify({ ai, email, sms }, null, 2));
process.exitCode = ai.status === "connected" && email.status === "connected" && sms.status === "sender_validated" ? 0 : 1;
