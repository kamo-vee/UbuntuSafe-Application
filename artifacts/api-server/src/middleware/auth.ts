import type { NextFunction, Request, Response } from "express";
import { bearerUser } from "../lib/auth.js";
import { db, eq, ubuntuUsers } from "@workspace/db";

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const tokenUser = bearerUser(req.headers.authorization);
  if (!tokenUser) {
    res.status(401).json({ message: "Authentication required." });
    return;
  }
  const [user] = await db
    .select({
      id: ubuntuUsers.id,
      email: ubuntuUsers.email,
      fullName: ubuntuUsers.fullName,
    })
    .from(ubuntuUsers)
    .where(eq(ubuntuUsers.id, tokenUser.id))
    .limit(1);
  if (!user) {
    res.status(401).json({ message: "Account not found." });
    return;
  }
  req.user = user;
  next();
}
