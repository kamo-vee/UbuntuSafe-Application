import { ProviderError } from "./ai-provider.js";

/** Server-only configuration. Never log or serialize the returned credentials. */
export function emailConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!host || !from) throw new ProviderError(
    "Email is not configured. Set SMTP_HOST and EMAIL_FROM in the backend's private .env file.",
    "EMAIL_NOT_CONFIGURED",
  );
  const port = Number(process.env.SMTP_PORT || 587);
  const secureValue = process.env.SMTP_SECURE || "false";
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !["true", "false"].includes(secureValue))
    throw new ProviderError("Check SMTP_PORT and SMTP_SECURE. Use a valid port and true or false.", "EMAIL_CONFIGURATION");
  const secure = secureValue === "true";
  const user = process.env.SMTP_USER?.trim();
  let pass = process.env.SMTP_PASS;
  if (Boolean(user) !== Boolean(pass))
    throw new ProviderError("Set both SMTP_USER and SMTP_PASS for authenticated email.", "EMAIL_CONFIGURATION");
  const gmail = host.toLowerCase() === "smtp.gmail.com";
  if (gmail) {
    pass = pass?.replace(/\s/g, "");
    if (!user || !pass || !/^[A-Za-z0-9]{16}$/.test(pass))
      throw new ProviderError("Gmail requires your full email address in SMTP_USER and a Google app password in SMTP_PASS, not your normal Google password.", "GMAIL_APP_PASSWORD_REQUIRED");
    if (!(port === 465 && secure || port === 587 && !secure))
      throw new ProviderError("For Gmail use SMTP_PORT=465 with SMTP_SECURE=true, or 587 with false.", "EMAIL_TLS_CONFIGURATION");
  }
  return { host, port, secure, user, pass, from, requireTLS: gmail && !secure };
}

export function smsConfig() {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  if (!sid || !token || !from)
    throw new ProviderError("SMS is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER in the backend's private .env file.", "SMS_NOT_CONFIGURED");
  if (!/^AC[0-9a-f]{32}$/i.test(sid) || !/^[0-9a-f]{32}$/i.test(token) || !/^\+[1-9]\d{7,14}$/.test(from))
    throw new ProviderError("Check the Twilio Account SID (starting AC), matching account Auth Token, and SMS sender number including + and country code. Do not use an API-key SID instead.", "SMS_CONFIGURATION");
  return { sid, token, from };
}
