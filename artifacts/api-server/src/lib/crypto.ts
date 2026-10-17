import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const secret = process.env.SESSION_SECRET;
if (!secret && process.env.NODE_ENV === "production") {
  throw new Error("SESSION_SECRET is required in production.");
}
const signingSecret = secret ?? "development-only-session-secret";

export function signToken(payload: {
  userId: string;
  email: string;
  exp: number;
}) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", signingSecret)
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

export function verifyToken(
  token: string,
): { userId: string; email: string; exp: number } | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = createHmac("sha256", signingSecret).update(body).digest();
  const received = Buffer.from(signature, "base64url");
  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  )
    return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as {
      userId: string;
      email: string;
      exp: number;
    };
    return parsed.exp > Date.now() ? parsed : null;
  } catch {
    return null;
  }
}

export function hashContent(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function sanitizeText(value: string, maxLength = 4000) {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

export function newDeviceId() {
  return randomBytes(16).toString("hex");
}
