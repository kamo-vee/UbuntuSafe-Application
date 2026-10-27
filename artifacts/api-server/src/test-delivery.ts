import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deliveryArguments } from "./lib/delivery-arguments.js";
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../..", ".env"), quiet: true });
let recipients: ReturnType<typeof deliveryArguments> | undefined;
try { recipients = deliveryArguments(process.argv.slice(2)); }
catch (error) {
  console.error(error instanceof Error ? error.message : "Invalid delivery-test arguments. No messages sent.");
  process.exitCode = 1;
}
if (recipients) {
  const { email, phone } = recipients;
  const { sendConnectionTestEmail, sendConnectionTestSms } = await import("./lib/email.js");
  for (const [channel, send] of [
    ...(email ? [["email", () => sendConnectionTestEmail(email)] as const] : []),
    ...(phone ? [["sms", () => sendConnectionTestSms(phone)] as const] : []),
  ]) {
    try {
      await send();
      console.log(JSON.stringify({ channel, status: "provider_accepted", note: "Check the recipient inbox/device. Provider acceptance is not proof of delivery." }));
    } catch {
      console.error(JSON.stringify({ channel, status: "failed", action: "Run services:check and correct your private provider configuration." }));
      process.exitCode = 1;
    }
  }
}
