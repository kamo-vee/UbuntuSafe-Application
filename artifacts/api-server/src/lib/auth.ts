import bcrypt from "bcryptjs";
import { db, eq, ubuntuUsers } from "@workspace/db";
import { signToken, verifyToken } from "./crypto.js";

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  surname?: string;
  dateOfBirth?: string | null;
  role?: "admin";
};

export async function registerUser(
  fullName: string,
  surname: string,
  dateOfBirth: string,
  email: string,
  phone: string | null,
  password: string,
  language = "English",
) {
  if (phone) {
    const [existingPhone] = await db
      .select({ id: ubuntuUsers.id })
      .from(ubuntuUsers)
      .where(eq(ubuntuUsers.phone, phone))
      .limit(1);
    if (existingPhone)
      throw Object.assign(new Error("A different account already uses that phone number."), {
        statusCode: 409,
      });
  }
  const existing = await db
    .select({ id: ubuntuUsers.id })
    .from(ubuntuUsers)
    .where(eq(ubuntuUsers.email, email))
    .limit(1);
  if (existing.length)
    throw Object.assign(
      new Error("An account with that email already exists."),
      { statusCode: 409 },
    );
  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db
    .insert(ubuntuUsers)
    .values({
      fullName,
      surname,
      dateOfBirth,
      email,
      phone,
      passwordHash,
      language,
    })
    .returning();
  return issueUser(user);
}

export async function loginUser(email: string, password: string) {
  const [user] = await db
    .select()
    .from(ubuntuUsers)
    .where(eq(ubuntuUsers.email, email))
    .limit(1);
  if (!user)
    throw Object.assign(
      new Error("No account was found for this email. Create an account to continue."),
      { statusCode: 404 },
    );
  if (password.length < 8)
    throw Object.assign(
      new Error("Password must be at least 8 characters."),
      { statusCode: 400 },
    );
  if (!user.passwordHash || !(await bcrypt.compare(password, user.passwordHash)))
    throw Object.assign(new Error("Incorrect password. Try again or reset it."), {
      statusCode: 401,
    });
  await db.update(ubuntuUsers).set({ lastSignedInAt: new Date() }).where(eq(ubuntuUsers.id, user.id));
  return issueUser(user);
}

function issueUser(user: typeof ubuntuUsers.$inferSelect) {
  const authUser: AuthUser = {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    surname: user.surname,
    dateOfBirth: user.dateOfBirth,
  };
  return {
    token: signToken({
      userId: user.id,
      email: user.email,
      exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
    }),
    user: authUser,
  };
}

export function bearerUser(authorization?: string) {
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = verifyToken(authorization.slice(7));
  return token
    ? { id: token.userId, email: token.email, role: token.role }
    : null;
}
