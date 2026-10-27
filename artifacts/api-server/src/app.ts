import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import router from "./routes/index.js";
import { ZodError } from "zod";

const app = express();
const origins = (process.env.WEB_ORIGINS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(cors({ origin: origins.length ? origins : true, credentials: true }));
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: false, limit: "16kb" }));
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 200,
    standardHeaders: "draft-8",
  }),
);
app.use("/api", router);
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (error instanceof ZodError) {
      const issue = error.issues[0];
      const field = issue?.path.join(" ") || "input";
      res.status(400).json({
        message: `Please check ${field}: ${issue?.message ?? "Enter a valid value."}`,
      });
      return;
    }
    const status =
      typeof error === "object" && error && "statusCode" in error
        ? Number(error.statusCode)
        : 500;
    const exposed = typeof error === "object" && error && "expose" in error && error.expose === true;
    const code = typeof error === "object" && error && "code" in error && error.code === "EMAIL_UNVERIFIED" ? error.code : undefined;
    res
      .status(status >= 400 && status <= 599 ? status : 500)
      .json({
        message: (status >= 400 && status < 500 || exposed) && error instanceof Error
          ? error.message
          : "The request could not be completed. Please try again.",
        ...(code ? { code } : {}),
      });
  },
);
export default app;
