import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { and, db, eq, isNull, ubuntuAdmins, ubuntuUsers } from "@workspace/db";
import { requireAuth } from "../middleware/auth.js";
import { administratorSchema } from "../lib/account-validation.js";
import { adminAnalytics, adminReportCsv } from "../lib/admin-analytics.js";
import { sendAdministratorReport } from "../lib/email.js";

const router = Router();
router.use(requireAuth);
router.use((req, res, next) => {
  if (req.user?.role !== "admin") return res.status(403).json({ message: "Administrator access is required." });
  return next();
});
router.use(rateLimit({ windowMs: 60000, limit: 40, standardHeaders: true, legacyHeaders: false }));
router.get("/analytics", async (_req, res, next) => {
  try { res.json(await adminAnalytics()); } catch (error) { next(error); }
});
router.get("/accounts", async (_req, res, next) => {
  try {
    res.json(await db.select({ id: ubuntuAdmins.id, fullName: ubuntuAdmins.fullName, surname: ubuntuAdmins.surname,
      email: ubuntuAdmins.email, createdAt: ubuntuAdmins.createdAt }).from(ubuntuAdmins).where(isNull(ubuntuAdmins.deletedAt)));
  } catch (error) { next(error); }
});
router.post("/accounts", async (req, res, next) => {
  try {
    const body = administratorSchema.parse(req.body);
    const [admin] = await db.select({ id: ubuntuAdmins.id }).from(ubuntuAdmins).where(eq(ubuntuAdmins.email, body.email)).limit(1);
    const [user] = await db.select({ id: ubuntuUsers.id }).from(ubuntuUsers).where(eq(ubuntuUsers.email, body.email)).limit(1);
    if (admin || user || body.email === process.env.UBUNTUSAFE_ADMIN_EMAIL?.trim().toLowerCase())
      return res.status(409).json({ message: "This email is already in use. Choose a different administrator email.",
        fieldErrors: { email: "This email is already in use." } });
    const [created] = await db.insert(ubuntuAdmins).values({ fullName: body.fullName, surname: body.surname, email: body.email,
      passwordHash: await bcrypt.hash(body.password, 12), createdBy: req.user!.id })
      .returning({ id: ubuntuAdmins.id, fullName: ubuntuAdmins.fullName, surname: ubuntuAdmins.surname, email: ubuntuAdmins.email, createdAt: ubuntuAdmins.createdAt });
    return res.status(201).json(created);
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505")
      return res.status(409).json({ message: "This administrator email is already in use.", fieldErrors: { email: "This email is already in use." } });
    return next(error);
  }
});
router.get("/export", async (_req, res, next) => {
  try {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="UbuntuSafe-admin-report.csv"');
    res.setHeader("Cache-Control", "no-store");
    res.send(await adminReportCsv());
  } catch (error) { next(error); }
});
router.post("/export/email", rateLimit({ windowMs: 15 * 60000, limit: 5, standardHeaders: true, legacyHeaders: false }), async (_req, res, next) => {
  try {
    const recipient = await sendAdministratorReport(await adminReportCsv());
    res.status(202).json({ accepted: true, recipient, message: "The email provider accepted the report. Please check the administrator inbox and spam folder." });
  } catch (error) { next(error); }
});
export default router;
