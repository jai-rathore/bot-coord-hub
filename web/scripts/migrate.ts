import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { postgresConnectionOptions } from "../src/db/connection";

config({ path: ".env.local" });
config();

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }
  const { url, ssl } = postgresConnectionOptions(process.env.DATABASE_URL);
  const pool = postgres(url, {
    prepare: false,
    max: 1,
    ...(ssl ? { ssl } : {}),
  });
  const connection = await pool.reserve();
  let locked = false;
  try {
    await connection`select pg_advisory_lock(hashtext(${"honeymatcha:database-migrations"}))`;
    locked = true;
    await migrate(drizzle(connection), {
      migrationsFolder: "./drizzle",
    });
  } finally {
    if (locked) {
      await connection`select pg_advisory_unlock(hashtext(${"honeymatcha:database-migrations"}))`;
    }
    connection.release();
    await pool.end({ timeout: 5 });
  }
  console.log("HoneyMatcha database migrations applied successfully.");
  process.exit(0);
}

main().catch((error) => {
  console.error("HoneyMatcha migration failed:", error);
  process.exit(1);
});
