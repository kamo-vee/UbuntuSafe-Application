import type { NextFunction, Request, Response } from "express";
import { bearerUser } from "../lib/auth.js";
import { and, db, eq, gt, isNull, revokedAuthTokens, ubuntuUsers } from "@workspace/db";
import { hashContent } from "../lib/crypto.js";

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
  const rawToken = req.headers.authorization!.slice("Bearer ".length);
  const [revoked] = await db
    .select({ tokenHash: revokedAuthTokens.tokenHash })
    .from(revokedAuthTokens)
    .where(
      and(
        eq(revokedAuthTokens.tokenHash, hashContent(rawToken)),
        gt(revokedAuthTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (revoked) {
    res.status(401).json({ message: "This session has ended. Sign in again." });
    return;
  }
  if (tokenUser.role === "admin") {
    const allowedAdminRequest =
      (req.path === "/reports" && req.method === "GET") ||
      (req.path === "/admin/records" && req.method === "GET") ||
      (req.path === "/admin/feedback" && req.method === "GET") ||
      (req.path === "/admin/reports/email" && req.method === "POST") ||
      (req.path === "/logout" && req.method === "POST");
    if (!allowedAdminRequest) {
      res.status(403).json({ message: "Administrator sessions cannot access this resource." });
      return;
    }
    req.user = {
      id: tokenUser.id,
      email: tokenUser.email,
      fullName: "Administrator",
      role: "admin",
    };
    next();
    return;
  }
  const [user] = await db
    .select({
      id: ubuntuUsers.id,
      email: ubuntuUsers.email,
      fullName: ubuntuUsers.fullName,
    })
    .from(ubuntuUsers)
    .where(and(eq(ubuntuUsers.id, tokenUser.id), isNull(ubuntuUsers.deletedAt)))
    .limit(1);
  if (!user) {
    res.status(401).json({ message: "Account not found." });
    return;
  }
  req.user = user;
  next();
}
