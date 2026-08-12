import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { postgresConnectionOptions } from "./src/db/connection";

const rawUrl =
  process.env.DATABASE_URL ?? "postgres://localhost:5432/honeymatcha";
const { url, ssl } = postgresConnectionOptions(rawUrl);

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url,
    // drizzle-kit accepts 'require'; local connections leave this unset.
    ...(ssl ? { ssl: "require" as const } : {}),
  },
});
