import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../..", ".env"), quiet: true });
const { checkEmailConnection, checkSmsConnection } = await import("./lib/email.js");
const { aiFailure, aiModels, createAIClient } = await import("./lib/ai-provider.js");
async function checkAI() {
  if (!process.env.GEMINI_API_KEY?.trim()) return { status: "not_configured", provider: "gemini" };
  try {
    const client = createAIClient();
    const text = await client.generate({ model: aiModels().scan, prompt: "Reply with OK only." });
    return { status: text ? "connected" : "empty_result", provider: "gemini", model: aiModels().scan };
  } catch (error) {
    const safe = aiFailure(error);
    return { status: "failed", provider: "gemini", httpStatus: safe.upstreamStatus,
      code: safe.code, action: safe.message };
  }
}
const [ai, email, sms] = await Promise.all([checkAI(), checkEmailConnection(), checkSmsConnection()]);
console.log(JSON.stringify({ ai, email, sms }, null, 2));
process.exitCode = ai.status === "connected" && email.status === "connected" && sms.status === "sender_validated" ? 0 : 1;
