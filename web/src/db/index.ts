import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  pgClient?: ReturnType<typeof postgres>;
};

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env.local (see .env.example).",
    );
  }
  return postgres(url, { prepare: false, max: 10 });
}

export function getDb() {
  if (!globalForDb.pgClient) {
    globalForDb.pgClient = createClient();
  }
  return drizzle(globalForDb.pgClient, { schema });
}

export type Db = ReturnType<typeof getDb>;
