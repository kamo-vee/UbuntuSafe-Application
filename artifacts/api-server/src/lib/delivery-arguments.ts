import { z } from "zod";

export function deliveryArguments(args: string[]) {
  let confirmed = false;
  let email: string | undefined, phone: string | undefined;
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === "--confirm-send") { confirmed = true; continue; }
    if (flag !== "--email-to" && flag !== "--sms-to") throw new Error("Unknown option. Use --confirm-send with --email-to and/or --sms-to.");
    const value = args[++index];
    if (!value || value.startsWith("--")) throw new Error("A recipient value is required after --email-to or --sms-to.");
    if (flag === "--email-to") {
      if (!z.string().email().safeParse(value).success) throw new Error("Enter a valid recipient email address.");
      email = value;
    } else {
      if (!/^\+[1-9]\d{7,14}$/.test(value)) throw new Error("Use an SMS recipient number with + and its country code.");
      phone = value;
    }
  }
  if (!confirmed || !email && !phone) throw new Error("No messages sent. Use --confirm-send with --email-to YOUR_EMAIL and/or --sms-to YOUR_NUMBER. Only contact recipients you control or have permission to contact. SMS may incur charges.");
  return { email, phone };
}
