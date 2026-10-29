import { Router } from "express";
import rateLimit from "express-rate-limit";
import { RequestEmailVerificationBody, ConfirmEmailVerificationBody } from "@workspace/api-zod";
import { confirmVerification, requestVerification } from "../lib/email-verification.js";

const router = Router();
const limits = rateLimit({
  windowMs: 15 * 60000, limit: 20, standardHeaders: true, legacyHeaders: false,
  message: { message: "Too many verification attempts. Try again in 15 minutes." },
});
router.post("/request", limits, async (req, res, next) => {
  try {
    const { email } = RequestEmailVerificationBody.parse(req.body);
    await requestVerification(email.trim().toLowerCase());
    return res.status(202).json({ message: "If this account needs verification, a code was sent. Check your inbox and spam folder." });
  } catch (error) { return next(error); }
});
router.post("/confirm", limits, async (req, res, next) => {
  try {
    const { email, code } = ConfirmEmailVerificationBody.parse(req.body);
    await confirmVerification(email.trim().toLowerCase(), code);
    return res.json({ message: "Email verified. You can sign in now." });
  } catch (error) { return next(error); }
});
export default router;
