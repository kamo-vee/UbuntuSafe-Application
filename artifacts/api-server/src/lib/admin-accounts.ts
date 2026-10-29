import bcrypt from "bcryptjs";
import { db, eq, ubuntuAdmins, ubuntuUsers } from "@workspace/db";
import type { z } from "zod";
import { administratorSchema } from "./account-validation.js";

export const administratorPublicFields = {
  id: ubuntuAdmins.id, fullName: ubuntuAdmins.fullName, surname: ubuntuAdmins.surname,
  email: ubuntuAdmins.email, createdAt: ubuntuAdmins.createdAt,
  approvalStatus: ubuntuAdmins.approvalStatus, reviewedAt: ubuntuAdmins.reviewedAt,
};
function duplicateEmail() {
  return Object.assign(new Error("This email is already registered. Use another email or contact an administrator."), {
    statusCode: 409, fieldErrors: { email: "This email is already registered." },
  });
}

/** Caller controls approval; request-body role/status fields are never trusted. */
export async function createAdministrator(
  input: z.infer<typeof administratorSchema>, createdBy: string, status: "pending" | "approved",
) {
  const [admin] = await db.select({ id: ubuntuAdmins.id }).from(ubuntuAdmins).where(eq(ubuntuAdmins.email, input.email)).limit(1);
  const [user] = await db.select({ id: ubuntuUsers.id }).from(ubuntuUsers).where(eq(ubuntuUsers.email, input.email)).limit(1);
  if (admin || user || input.email === process.env.UBUNTUSAFE_ADMIN_EMAIL?.trim().toLowerCase()) throw duplicateEmail();
  try {
    const [account] = await db.insert(ubuntuAdmins).values({
      fullName: input.fullName, surname: input.surname, email: input.email,
      passwordHash: await bcrypt.hash(input.password, 12), createdBy, approvalStatus: status,
      ...(status === "approved" ? { reviewedBy: createdBy, reviewedAt: new Date() } : {}),
    }).returning(administratorPublicFields);
    return account;
  } catch (error) {
    const postgres = error as { code?: string; cause?: { code?: string } };
    if ((postgres.code ?? postgres.cause?.code) === "23505") throw duplicateEmail();
    throw error;
  }
}
