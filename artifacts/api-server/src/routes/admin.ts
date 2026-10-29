import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { and, db, desc, eq, isNull, ubuntuAdmins } from "@workspace/db";
import { requireAuth } from "../middleware/auth.js";
import { administratorSchema } from "../lib/account-validation.js";
import { adminAnalytics, adminReportCsv } from "../lib/admin-analytics.js";
import { sendAdministratorReport } from "../lib/email.js";
import { administratorPublicFields, createAdministrator } from "../lib/admin-accounts.js";

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
    res.json(await db.select(administratorPublicFields).from(ubuntuAdmins)
      .where(and(isNull(ubuntuAdmins.deletedAt), eq(ubuntuAdmins.approvalStatus, "approved"))));
  } catch (error) { next(error); }
});
router.post("/accounts", async (req, res, next) => {
  try {
    const body = administratorSchema.parse(req.body);
    const created = await createAdministrator(body, req.user!.id, "approved");
    return res.status(201).json(created);
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505")
      return res.status(409).json({ message: "This administrator email is already in use.", fieldErrors: { email: "This email is already in use." } });
    return next(error);
  }
});
router.get("/registration-requests", async (_req, res, next) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json(await db.select(administratorPublicFields).from(ubuntuAdmins)
      .where(and(isNull(ubuntuAdmins.deletedAt), eq(ubuntuAdmins.createdBy, "self-registration")))
      .orderBy(desc(ubuntuAdmins.createdAt)));
  } catch (error) { next(error); }
});
router.post("/registration-requests/:id/review", async (req, res, next) => {
  try {
    const id = z.string().uuid("Choose a valid administrator request.").parse(req.params.id);
    const body = z.object({ decision: z.enum(["approve", "reject"]) }).parse(req.body);
    const [account] = await db.update(ubuntuAdmins).set({
      approvalStatus: body.decision === "approve" ? "approved" : "rejected",
      reviewedAt: new Date(), reviewedBy: req.user!.id,
    }).where(and(eq(ubuntuAdmins.id, id), isNull(ubuntuAdmins.deletedAt),
      eq(ubuntuAdmins.createdBy, "self-registration"), eq(ubuntuAdmins.approvalStatus, "pending")))
      .returning(administratorPublicFields);
    if (!account) return res.status(409).json({ message: "This request is no longer pending. Refresh the request list." });
    return res.json(account);
  } catch (error) { return next(error); }
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
