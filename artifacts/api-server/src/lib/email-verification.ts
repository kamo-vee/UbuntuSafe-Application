import { randomInt, timingSafeEqual } from "node:crypto";
import { and, db, emailVerificationTokens, eq, isNull, ubuntuUsers } from "@workspace/db";
import { hashContent } from "./crypto.js";
import { sendEmailVerificationCode } from "./email.js";

export const verificationHash = (userId: string, code: string) =>
  hashContent(`verify-email:${userId}:${code}:${process.env.SESSION_SECRET ?? ""}`);

export async function requestVerification(email: string) {
  const code = String(randomInt(100000, 1000000));
  const result = await db.transaction(async (tx) => {
    const [user] = await tx.select().from(ubuntuUsers)
      .where(and(eq(ubuntuUsers.email, email), isNull(ubuntuUsers.deletedAt))).for("update");
    if (!user || user.emailVerifiedAt || !user.emailVerificationRequired) return null;
    const [previous] = await tx.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.userId, user.id));
    if (previous && Date.now() - previous.createdAt.getTime() < 60000) {
      throw Object.assign(new Error("Wait one minute before requesting another verification code."), { statusCode: 429 });
    }
    const tokenHash = verificationHash(user.id, code);
    const values = { userId: user.id, tokenHash, attempts: 0, expiresAt: new Date(Date.now() + 600000), createdAt: new Date() };
    await tx.insert(emailVerificationTokens).values(values)
      .onConflictDoUpdate({ target: emailVerificationTokens.userId, set: values });
    return { userId: user.id, tokenHash };
  });
  if (!result) return;
  try {
    await sendEmailVerificationCode(email, code);
  } catch (error) {
    await db.delete(emailVerificationTokens).where(and(
      eq(emailVerificationTokens.userId, result.userId),
      eq(emailVerificationTokens.tokenHash, result.tokenHash),
    ));
    throw error;
  }
}

export async function confirmVerification(email: string, code: string) {
  const valid = await db.transaction(async (tx) => {
    const [user] = await tx.select().from(ubuntuUsers)
      .where(and(eq(ubuntuUsers.email, email), isNull(ubuntuUsers.deletedAt))).for("update");
    if (!user) return false;
    const [token] = await tx.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.userId, user.id));
    if (!token || token.expiresAt.getTime() <= Date.now() || token.attempts >= 5) return false;
    const expected = Buffer.from(token.tokenHash, "hex");
    const supplied = Buffer.from(verificationHash(user.id, code), "hex");
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      await tx.update(emailVerificationTokens).set({ attempts: token.attempts + 1 }).where(eq(emailVerificationTokens.userId, user.id));
      return false; // commit the failed attempt; throwing here would roll it back
    }
    await tx.update(ubuntuUsers).set({ emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(ubuntuUsers.id, user.id));
    await tx.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, user.id));
    return true;
  });
  if (!valid) throw Object.assign(new Error("The verification code is invalid, expired, already used, or has too many failed attempts. Request a new code."), { statusCode: 400 });
}
