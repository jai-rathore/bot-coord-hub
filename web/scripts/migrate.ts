import { config } from "dotenv";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { getDb } from "../src/db";

config({ path: ".env.local" });
config();

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
  console.log("HoneyMatcha database migrations applied successfully.");
  process.exit(0);
}

main().catch((error) => {
  console.error("HoneyMatcha migration failed:", error);
  process.exit(1);
});
