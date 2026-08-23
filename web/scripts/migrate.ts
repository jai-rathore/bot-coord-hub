import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { getDb } from "../src/db";

config({ path: ".env.local" });
config();

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${"honeymatcha:database-migrations"}))`,
    );
    await migrate(tx as unknown as Parameters<typeof migrate>[0], {
      migrationsFolder: "./drizzle",
    });
  });
  console.log("HoneyMatcha database migrations applied successfully.");
  process.exit(0);
}

main().catch((error) => {
  console.error("HoneyMatcha migration failed:", error);
  process.exit(1);
});
