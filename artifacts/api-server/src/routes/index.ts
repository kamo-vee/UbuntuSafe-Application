import { Router } from "express";
import { pool } from "@workspace/db";
import auth from "./auth.js";
import ubuntuSafe from "./ubuntu-safe.js";
import sync from "./sync.js";
import emailVerification from "./email-verification.js";
import backup from "./backup.js";

const router = Router();
router.get("/healthz", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "ok" });
  } catch {
    res.status(503).json({ status: "unavailable", database: "unavailable" });
  }
});
router.get("/rules/latest", (_req, res) => res.json({ version: "2026.09.1" }));
router.use("/auth", auth);
router.use("/auth/email-verification", emailVerification);
router.use("/sync", sync);
router.use("/backup", backup);
router.use("/", ubuntuSafe);
export default router;
