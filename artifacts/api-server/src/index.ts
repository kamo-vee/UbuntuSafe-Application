import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
dotenv.config({ path: resolve(projectRoot, ".env") });
const [{ default: app }, { pool }] = await Promise.all([
  import("./app.js"),
  import("@workspace/db"),
]);

const port = Number(process.env.PORT ?? 8080);
if (!Number.isInteger(port) || port <= 0)
  throw new Error("PORT must be a positive integer.");

try {
  await pool.query("SELECT 1");
  const schema = await pool.query<{
    users: string | null;
    resetTokens: string | null;
    scans: string | null;
    reports: string | null;
  }>(
    `SELECT to_regclass('public.ubuntu_users') AS users,
            to_regclass('public.password_reset_tokens') AS "resetTokens",
            to_regclass('public.scans') AS scans,
            to_regclass('public.community_reports') AS reports`,
  );
  if (
    !schema.rows[0]?.users ||
    !schema.rows[0]?.resetTokens ||
    !schema.rows[0]?.scans ||
    !schema.rows[0]?.reports
  ) {
    throw new Error(
      "UbuntuSafe database tables are missing. Run `pnpm db:migrate` before starting the API.",
    );
  }
  app.listen(port, () => console.log(`UbuntuSafe API listening on ${port}`));
} catch (error) {
  console.error(
    "UbuntuSafe could not connect to its configured PostgreSQL database. Check DATABASE_URL and run `pnpm db:migrate`.",
    error,
  );
  await pool.end();
  process.exitCode = 1;
}
