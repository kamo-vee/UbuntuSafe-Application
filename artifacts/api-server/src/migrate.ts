import dotenv from "dotenv";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
dotenv.config({ path: resolve(projectRoot, ".env") });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required. Copy .env.example to .env and configure PostgreSQL.",
  );
}

const client = new pg.Client({ connectionString: databaseUrl });
try {
  await client.connect();
  const migrationsPath = resolve(projectRoot, "lib/migrations");
  const migrations = (await readdir(migrationsPath))
    .filter((file) => /^\d+_[a-z0-9_-]+\.sql$/.test(file))
    .sort();
  if (!migrations.length) throw new Error("No SQL migrations were found.");
  await client.query("BEGIN");
  for (const file of migrations) {
    await client.query(await readFile(resolve(migrationsPath, file), "utf8"));
    console.log(`Applied ${file}`);
  }
  await client.query("COMMIT");
  console.log("UbuntuSafe database schema is ready.");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error("Database migration failed.", error);
  process.exitCode = 1;
} finally {
  await client.end();
}
