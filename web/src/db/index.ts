import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { postgresConnectionOptions } from "./connection";
import { countQuery } from "@/lib/perf";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  pgClient?: ReturnType<typeof postgres>;
  drizzleDb?: ReturnType<typeof buildDb>;
};

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env.local (see .env.example).",
    );
  }
  const { url: connectionUrl, ssl } = postgresConnectionOptions(url);
  const configuredMax = Number(process.env.DB_POOL_MAX ?? 10);
  const poolMax =
    Number.isInteger(configuredMax) && configuredMax > 0
      ? Math.min(configuredMax, 50)
      : 10;
  return postgres(connectionUrl, {
    prepare: false,
    max: poolMax,
    ...(ssl ? { ssl } : {}),
  });
}

function buildDb(client: ReturnType<typeof postgres>) {
  return drizzle(client, {
    schema,
    // Counts every statement drizzle issues. Query count per request is the
    // metric this codebase's latency work is measured against; see lib/perf.ts.
    logger: {
      logQuery(query) {
        countQuery(query);
      },
    },
  });
}

export function getDb() {
  if (!globalForDb.pgClient) {
    globalForDb.pgClient = createClient();
  }
  if (!globalForDb.drizzleDb) {
    globalForDb.drizzleDb = buildDb(globalForDb.pgClient);
  }
  return globalForDb.drizzleDb;
}

/** Close long-lived database connections during worker shutdown. */
export async function closeDb() {
  const client = globalForDb.pgClient;
  globalForDb.drizzleDb = undefined;
  globalForDb.pgClient = undefined;
  if (client) await client.end({ timeout: 5 });
}

export type Db = ReturnType<typeof getDb>;
