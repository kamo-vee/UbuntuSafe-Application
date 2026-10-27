import nodemailer from "nodemailer";
import { Buffer } from "node:buffer";
import { ProviderError } from "./ai-provider.js";
import { emailConfig, smsConfig } from "./provider-config.js";

function emailTransport() {
  const { host, port, secure, user, pass, requireTLS } = emailConfig();
  return nodemailer.createTransport({
  host, port, secure, requireTLS,
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
  ...(user && pass ? { auth: { user, pass } } : {}),
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character]!;
  });
}

export async function sendPasswordResetEmail(email: string, resetUrl: string) {
  const safeUrl = escapeHtml(resetUrl);
  await emailTransport().sendMail({
    from: process.env.EMAIL_FROM ?? "UbuntuSafe <no-reply@ubuntusafe.local>",
    to: email,
    subject: "Reset your UbuntuSafe password",
    text: [
      "We received a request to reset your UbuntuSafe password.",
      "Open this link in UbuntuSafe to choose a new password:",
      resetUrl,
      "",
      "If the link does not open the app, copy the complete link into UbuntuSafe's reset-password screen.",
      "This link expires in 10 minutes. If you did not request a reset, ignore this message.",
    ].join("\n"),
    html: `<p>We received a request to reset your UbuntuSafe password.</p>
      <p><a href="${safeUrl}">Choose a new password</a></p>
      <p>If the link does not open the app, copy the complete link into UbuntuSafe's reset-password screen.</p>
      <p>This link expires in 10 minutes. If you did not request a reset, ignore this message.</p>`,
  });
}

export function isEmailDeliveryConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.EMAIL_FROM);
}

export async function checkEmailConnection() {
  if (!isEmailDeliveryConfigured()) return { status: "not_configured" };
  try {
    await emailTransport().verify();
    return { status: "connected", note: "SMTP authenticated; inbox delivery still requires a recipient test." };
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "connection_failed";
    return { status: "failed", code,
      action: error instanceof ProviderError ? error.message
        : code === "EAUTH" ? "Check the SMTP login. Gmail requires a Google app password, not the normal Google password."
          : code === "ETIMEDOUT" || code === "ECONNECTION" ? "Check the SMTP host, port, TLS mode and network access."
            : "Check the SMTP settings and the email provider's sender permissions." };
  }
}

export async function sendEmailVerificationCode(email: string, code: string) {
  if (!isEmailDeliveryConfigured()) {
    throw Object.assign(new Error("Email verification delivery is not configured. Your account remains pending; try resending after the server is configured."), { statusCode: 503, expose: true });
  }
  try {
    const result = await emailTransport().sendMail({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: "Verify your UbuntuSafe email",
      text: `Your UbuntuSafe email verification code is ${code}. It expires in 10 minutes and can be used once. If you did not register, ignore this message.`,
    });
    if (!result.accepted.length) throw new Error("Recipient not accepted");
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw Object.assign(new Error("The email provider did not accept the verification message. Your account remains pending. Please try resending later."), { statusCode: 503, expose: true });
  }
}

export async function sendPasswordResetCode(email: string, code: string) {
  if (!isEmailDeliveryConfigured()) {
    throw Object.assign(new Error("Email delivery is not configured."), { statusCode: 503 });
  }
  await emailTransport().sendMail({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: "Your UbuntuSafe password reset code",
    text: `Your UbuntuSafe reset code is ${code}. It expires in 10 minutes. If you did not request this code, ignore this message.`,
  });
}

export function isSmsDeliveryConfigured() {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);
}

export async function sendPasswordResetSms(phone: string, code: string) {
  await sendSmsMessage(phone, `UbuntuSafe password reset code: ${code}. Expires in 10 minutes.`);
}

async function sendSmsMessage(phone: string, message: string) {
  const { sid, token, from } = smsConfig();
  if (!/^\+[1-9]\d{7,14}$/.test(phone))
    throw Object.assign(new Error("Enter the recipient phone number with + and its country code."), { statusCode: 400 });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    signal: AbortSignal.timeout(15000),
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ From: from, To: phone, Body: message }),
  });
  if (!response.ok) {
    throw Object.assign(new Error("SMS provider could not deliver the reset code."), { statusCode: 502 });
  }
}

export async function checkSmsConnection() {
  if (!isSmsDeliveryConfigured()) return { status: "not_configured" };
  try {
    const { sid, token, from } = smsConfig();
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json?${new URLSearchParams({ PhoneNumber: from })}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return { status: "failed", httpStatus: response.status,
      action: response.status === 401 ? "Use an active matching Twilio Account SID and account Auth Token." : "Check account permissions and the configured SMS sender." };
    const data = await response.json() as { incoming_phone_numbers?: { capabilities?: { sms?: boolean } }[] };
    return data.incoming_phone_numbers?.some((number) => number.capabilities?.sms)
      ? { status: "sender_validated", note: "Authentication and SMS-capable sender confirmed; recipient delivery not tested." }
      : { status: "sender_unavailable", note: "Configured sender was not confirmed as an SMS-capable number on this account." };
  } catch (error) {
    return { status: "connection_failed",
      ...(error instanceof ProviderError ? { code: error.code, action: error.message } : { action: "Check access to the Twilio API and try again." }) };
  }
}

export async function sendUserReportEmail(email: string, report: string) {
  await emailTransport().sendMail({
    from: process.env.EMAIL_FROM ?? "UbuntuSafe <no-reply@ubuntusafe.local>",
    to: email,
    subject: "Your UbuntuSafe community report",
    text: `An administrator selected a report for delivery to you.\n\n${report}\n\nThis message was sent by UbuntuSafe.`,
  });
}

export async function sendConnectionTestEmail(email: string) {
  const { from } = emailConfig();
  const result = await emailTransport().sendMail({
    from, to: email, subject: "UbuntuSafe connection test",
    text: "UbuntuSafe email connection test. This is not an account verification or password-reset code.",
  });
  if (!result.accepted.length) throw new ProviderError("The provider did not accept the test email.", "EMAIL_REJECTED");
}

export async function sendConnectionTestSms(phone: string) {
  await sendSmsMessage(phone, "UbuntuSafe SMS connection test. This is not a verification or password-reset code.");
}
