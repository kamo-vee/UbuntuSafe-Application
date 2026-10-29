import type { NextFunction, Request, Response } from "express";
import { bearerUser } from "../lib/auth.js";
import { and, db, eq, gt, isNull, revokedAuthTokens, ubuntuUsers, ubuntuAdmins } from "@workspace/db";
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
      req.baseUrl === "/api/admin" ||
      (["/", "/database", "/snapshot", "/restore"].includes(req.path) && req.baseUrl === "/api/backup") ||
      (req.path === "/reports" && req.method === "GET") ||
      (req.path === "/admin/records" && req.method === "GET") ||
      (req.path === "/admin/feedback" && req.method === "GET") ||
      (req.path === "/admin/reports/email" && req.method === "POST") ||
      (req.path === "/logout" && req.method === "POST");
    if (!allowedAdminRequest) {
      res.status(403).json({ message: "Administrator sessions cannot access this resource." });
      return;
    }
    let fullName = "Administrator";
    if (tokenUser.id !== "admin") {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tokenUser.id)) {
        res.status(401).json({ message: "Administrator account not found. Sign in again." }); return;
      }
      const [admin] = await db.select().from(ubuntuAdmins)
        .where(and(eq(ubuntuAdmins.id, tokenUser.id), isNull(ubuntuAdmins.deletedAt))).limit(1);
      if (!admin || admin.approvalStatus !== "approved") { res.status(401).json({ message: "Approved administrator account not found. Sign in again." }); return; }
      fullName = `${admin.fullName} ${admin.surname}`;
    }
    req.user = {
      id: tokenUser.id,
      email: tokenUser.email,
      fullName,
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
      sessionVersion: ubuntuUsers.sessionVersion,
      emailVerifiedAt: ubuntuUsers.emailVerifiedAt,
      emailVerificationRequired: ubuntuUsers.emailVerificationRequired,
    })
    .from(ubuntuUsers)
    .where(and(eq(ubuntuUsers.id, tokenUser.id), isNull(ubuntuUsers.deletedAt)))
    .limit(1);
  if (!user) {
    res.status(401).json({ message: "Account not found." });
    return;
  }
  if (user.sessionVersion !== tokenUser.sessionVersion) {
    res.status(401).json({ message: "This session has ended. Sign in again." });
    return;
  }
  if (user.emailVerificationRequired && !user.emailVerifiedAt && req.path !== "/logout") {
    res.status(403).json({ message: "Verify your email before continuing.", code: "EMAIL_UNVERIFIED" });
    return;
  }
  req.user = { id: user.id, email: user.email, fullName: user.fullName };
  next();
}
