import nodemailer from "nodemailer";
import { Buffer } from "node:buffer";

const port = Number(process.env.SMTP_PORT ?? 1025);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("SMTP_PORT must be a valid TCP port.");
}

const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? "localhost",
  port,
  secure: process.env.SMTP_SECURE === "true",
  ...(user && pass ? { auth: { user, pass } } : {}),
});

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
  await transporter.sendMail({
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

export async function sendPasswordResetCode(email: string, code: string) {
  if (!isEmailDeliveryConfigured()) {
    throw Object.assign(new Error("Email delivery is not configured."), { statusCode: 503 });
  }
  await transporter.sendMail({
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
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) {
    throw Object.assign(new Error("SMS delivery is not configured."), { statusCode: 503 });
  }
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ From: from, To: phone, Body: `UbuntuSafe password reset code: ${code}. Expires in 10 minutes.` }),
  });
  if (!response.ok) {
    throw Object.assign(new Error("SMS provider could not deliver the reset code."), { statusCode: 502 });
  }
}

export async function sendUserReportEmail(email: string, report: string) {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM ?? "UbuntuSafe <no-reply@ubuntusafe.local>",
    to: email,
    subject: "Your UbuntuSafe community report",
    text: `An administrator selected a report for delivery to you.\n\n${report}\n\nThis message was sent by UbuntuSafe.`,
  });
}
