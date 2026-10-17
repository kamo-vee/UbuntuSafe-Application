import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import router from "./routes/index.js";

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
    const status =
      typeof error === "object" && error && "statusCode" in error
        ? Number(error.statusCode)
        : 400;
    res
      .status(status >= 400 && status < 500 ? status : 500)
      .json({
        message: error instanceof Error ? error.message : "Request failed.",
      });
  },
);
export default app;
