import { Router } from "express";
import { z } from "zod";
import { and, communityReports, db, eq, gt, inArray, scans } from "@workspace/db";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);
const syncScan = z.object({
  id: z.string().min(1),
  userId: z.string().optional(),
  kind: z.enum(["message", "voice", "email", "link", "job"]),
  content: z.string(),
  status: z.enum(["safe", "warning", "danger"]),
  title: z.string(),
  detail: z.string(),
  deviceId: z.string().optional(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});
const syncReport = z.object({
  id: z.string().min(1),
  category: z.enum(["scam", "unsafe-job", "suspicious-link", "other"]),
  details: z.string(),
  status: z.enum(["received", "reviewing"]).default("received"),
  clientId: z.string().optional(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});
const syncBody = z.object({
  scans: z.array(syncScan).max(500),
  reports: z.array(syncReport).max(500),
});

router.get("/", async (req, res, next) => {
  try {
    const since = new Date(String(req.query.since ?? 0));
    const [serverScans, serverReports] = await Promise.all([
      db
        .select()
        .from(scans)
        .where(and(eq(scans.userId, req.user!.id), gt(scans.updatedAt, since))),
      db
        .select()
        .from(communityReports)
        .where(
          and(
            eq(communityReports.userId, req.user!.id),
            gt(communityReports.updatedAt, since),
          ),
        ),
    ]);
    res.json({
      scans: serverScans,
      reports: serverReports,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const body = syncBody.parse(req.body);
    const ids = body.scans.map((item) => item.id);
    const existing = ids.length
      ? await db
          .select({ id: scans.id, updatedAt: scans.updatedAt })
          .from(scans)
          .where(and(eq(scans.userId, req.user!.id), inArray(scans.id, ids)))
      : [];
    const existingById = new Map(
      existing.map((item) => [item.id, item.updatedAt.getTime()]),
    );
    for (const item of body.scans) {
      if ((existingById.get(item.id) ?? 0) > new Date(item.updatedAt).getTime())
        continue;
      await db
        .insert(scans)
        .values({
          id: item.id,
          userId: req.user!.id,
          kind: item.kind,
          content: item.content,
          status: item.status,
          title: item.title,
          detail: item.detail,
          deviceId: item.deviceId,
          updatedAt: new Date(item.updatedAt),
          deletedAt: item.deletedAt ? new Date(item.deletedAt) : null,
        })
        .onConflictDoUpdate({
          target: scans.id,
          set: {
            content: item.content,
            status: item.status,
            title: item.title,
            detail: item.detail,
            updatedAt: new Date(item.updatedAt),
            deletedAt: item.deletedAt ? new Date(item.deletedAt) : null,
          },
        });
    }
    for (const item of body.reports) {
      const [current] = await db
        .select({ updatedAt: communityReports.updatedAt })
        .from(communityReports)
        .where(
          and(
            eq(communityReports.userId, req.user!.id),
            eq(communityReports.id, item.id),
          ),
        )
        .limit(1);
      if (
        current &&
        current.updatedAt.getTime() > new Date(item.updatedAt).getTime()
      )
        continue;
      await db
        .insert(communityReports)
        .values({
          id: item.id,
          userId: req.user!.id,
          category: item.category,
          details: item.details,
          status: item.status,
          clientId: item.clientId,
          updatedAt: new Date(item.updatedAt),
          deletedAt: item.deletedAt ? new Date(item.deletedAt) : null,
        })
        .onConflictDoUpdate({
          target: communityReports.id,
          set: {
            category: item.category,
            details: item.details,
            status: item.status,
            clientId: item.clientId,
            updatedAt: new Date(item.updatedAt),
            deletedAt: item.deletedAt ? new Date(item.deletedAt) : null,
          },
        });
    }
    res.json({
      accepted: body.scans.length + body.reports.length,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
