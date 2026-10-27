import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { and, db, eq, gt, passwordResetTokens, revokedAuthTokens, ubuntuUsers } from "@workspace/db";
import bcrypt from "bcryptjs";
import { loginUser, registerUser } from "../lib/auth.js";
import { hashContent, signToken, verifyToken } from "../lib/crypto.js";
import {
  isEmailDeliveryConfigured,
  isSmsDeliveryConfigured,
  sendPasswordResetCode,
  sendPasswordResetSms,
} from "../lib/email.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const resetRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
});
const adminLoginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
});
const emailSchema = z
  .string()
  .trim()
  .email()
  .max(200)
  .transform((value) => value.toLowerCase());
const phoneSchema = z.string().trim().regex(/^\+[1-9]\d{7,14}$/);
const strongPasswordSchema = z.string().min(10).max(200)
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, "Use uppercase and lowercase letters, a number and a symbol.");
const credentials = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
  email: emailSchema,
  password: z.string().min(8).max(200),
});

router.post("/register", async (req, res, next) => {
  try {
    const body = credentials
      .extend({
        fullName: z.string().trim().min(2).max(80),
        surname: z.string().trim().min(2).max(80),
        dateOfBirth: z.string().date(),
        phone: z.string().regex(/^\+[1-9]\d{7,14}$/).nullable().optional(),
        language: z.string().trim().min(2).max(40).optional(),
        password: strongPasswordSchema,
      })
      .parse(req.body);
    res
      .status(201)
      .json(await registerUser(
        body.fullName,
        body.surname,
        body.dateOfBirth,
        body.email,
        body.phone ?? null,
        body.password,
        body.language,
      ));
  } catch (error) {
    next(error);
  }
});

function securelyEqual(left: string, right: string) {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

router.post("/admin-login", adminLoginRateLimit, async (req, res, next) => {
  try {
    const body = z.object({
      email: emailSchema,
      password: z.string().min(1).max(200),
    }).parse(req.body);
    const adminEmail = process.env.UBUNTUSAFE_ADMIN_EMAIL?.trim().toLowerCase();
    const adminPassword = process.env.UBUNTUSAFE_ADMIN_PASSWORD;
    if (!adminEmail || !adminPassword || adminPassword.length < 12) {
      return res.status(503).json({ message: "Administrator sign-in is not configured correctly on this server." });
    }
    const emailMatches = securelyEqual(body.email, adminEmail);
    const passwordMatches = securelyEqual(body.password, adminPassword);
    if (!emailMatches || !passwordMatches) {
      return res.status(401).json({ message: "The administrator email or password is incorrect." });
    }
    const token = signToken({
      userId: "admin",
      email: adminEmail,
      role: "admin",
      exp: Date.now() + 8 * 60 * 60 * 1000,
    });
    return res.json({ token, user: { email: adminEmail, fullName: "Administrator" } });
  } catch (error) {
    return next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const body = z
      .object({
        email: emailSchema,
        password: z.string().min(1).max(200),
      })
      .parse(req.body);
    return res.json(await loginUser(body.email, body.password));
  } catch (error) {
    return next(error);
  }
});

router.post("/forgot-password", resetRateLimit, async (req, res, next) => {
  try {
    const body = z.object({
      channel: z.enum(["email", "sms"]),
      destination: z.string().trim().min(3).max(200),
    }).parse(req.body);
    const destination = body.channel === "email"
      ? emailSchema.parse(body.destination)
      : phoneSchema.parse(body.destination);
    if (body.channel === "email" && !isEmailDeliveryConfigured()) {
      return res.status(503).json({ message: "Email recovery is not configured." });
    }
    if (body.channel === "sms" && !isSmsDeliveryConfigured()) {
      return res.status(503).json({ message: "SMS recovery is not configured." });
    }
    const response = {
      message: "If an account exists for that contact, a reset code has been sent.",
    };
    const [user] = await db
      .select({ id: ubuntuUsers.id })
      .from(ubuntuUsers)
      .where(body.channel === "email"
        ? eq(ubuntuUsers.email, destination)
        : eq(ubuntuUsers.phone, destination))
      .limit(1);

    if (user) {
      const code = String(randomInt(100000, 1000000));
      const tokenHash = createHash("sha256")
        .update(`${user.id}:${code}:${process.env.SESSION_SECRET ?? ""}`)
        .digest("hex");
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await db.transaction(async (tx) => {
        await tx
          .delete(passwordResetTokens)
          .where(eq(passwordResetTokens.userId, user.id));
        await tx.insert(passwordResetTokens).values({
          userId: user.id,
          tokenHash,
          expiresAt,
        });
      });

      try {
        if (body.channel === "email") await sendPasswordResetCode(destination, code);
        else await sendPasswordResetSms(destination, code);
      } catch (error) {
        await db
          .delete(passwordResetTokens)
          .where(eq(passwordResetTokens.tokenHash, tokenHash))
          .catch(() => undefined);
        throw error;
      }
    }

    return res.status(202).json(response);
  } catch (error) {
    return next(error);
  }
});

router.post("/reset-password", resetRateLimit, async (req, res, next) => {
  try {
    const body = z
      .object({
        channel: z.enum(["email", "sms"]),
        destination: z.string().trim().min(3).max(200),
        code: z.string().regex(/^\d{6}$/),
        password: strongPasswordSchema,
      })
      .parse(req.body);
    const destination = body.channel === "email"
      ? emailSchema.parse(body.destination)
      : phoneSchema.parse(body.destination);
    const now = new Date();

    await db.transaction(async (tx) => {
      const [user] = await tx.select({ id: ubuntuUsers.id })
        .from(ubuntuUsers)
        .where(body.channel === "email"
          ? eq(ubuntuUsers.email, destination)
          : eq(ubuntuUsers.phone, destination))
        .limit(1);
      if (!user) throw Object.assign(new Error("The reset code is invalid or expired."), { statusCode: 400 });
      const tokenHash = createHash("sha256")
        .update(`${user.id}:${body.code}:${process.env.SESSION_SECRET ?? ""}`)
        .digest("hex");
      const [reset] = await tx
        .select()
        .from(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.tokenHash, tokenHash),
            gt(passwordResetTokens.expiresAt, now),
          ),
        )
        .limit(1)
        .for("update");
      if (!reset) {
        throw Object.assign(
          new Error("This password reset link is invalid or expired."),
          { statusCode: 400 },
        );
      }

      const passwordHash = await bcrypt.hash(body.password, 12);
      await tx
        .update(ubuntuUsers)
        .set({ passwordHash, updatedAt: now })
        .where(eq(ubuntuUsers.id, reset.userId));
      await tx
        .delete(passwordResetTokens)
        .where(eq(passwordResetTokens.userId, reset.userId));
    });

      return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

router.post("/logout", requireAuth, async (req, res, next) => {
  try {
    const token = req.headers.authorization!.slice("Bearer ".length);
    const payload = verifyToken(token);
    if (payload) {
      await db
        .insert(revokedAuthTokens)
        .values({
          tokenHash: hashContent(token),
          expiresAt: new Date(payload.exp),
        })
        .onConflictDoNothing();
    }
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

router.get("/me", requireAuth, (req, res) => res.json({ user: req.user }));

router.delete("/me", requireAuth, async (req, res, next) => {
  try {
    await db
      .update(ubuntuUsers)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(ubuntuUsers.id, req.user!.id));
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
