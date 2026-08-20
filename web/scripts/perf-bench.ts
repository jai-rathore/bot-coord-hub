/**
 * Query-count and latency bench for the hot server paths.
 *
 * The HTTP harness (scripts/perf-baseline.mjs) cannot reach signed-in pages
 * locally or in CI: with placeholder Clerk keys every browser navigation
 * 307s to Clerk's dev-browser-missing handshake, and there is no way to mint a
 * session. This bench sidesteps Clerk entirely by calling the same library
 * functions the /app pages and layout call, against seeded data — the same
 * approach scripts/e2e-lib.ts uses for correctness.
 *
 * Query count is the primary number. Nearly every latency problem on these
 * paths is "too many round trips", and unlike wall-clock it is stable enough
 * to compare across machines and to gate on.
 *
 *   DATABASE_URL=... npx tsx scripts/perf-bench.ts
 *   DATABASE_URL=... npx tsx scripts/perf-bench.ts --json > perf-before.json
 *   DATABASE_URL=... npx tsx scripts/perf-bench.ts --compare perf-before.json
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { inArray } from "drizzle-orm";
import { getDb } from "../src/db";
import { users, type User } from "../src/db/schema";
import { perfSnapshot } from "../src/lib/perf";
import { getHomeStatus } from "../src/lib/home-status";
import { listSessionsForUser, createSessionForUser } from "../src/lib/sessions";
import { listLinksForUser, createInviteLink, acceptInviteLink } from "../src/lib/links";
import { listConfirmsForUser, requestConfirm } from "../src/lib/confirms";
import { listPeopleMetThroughEvents } from "../src/lib/people";
import { listEventsWithUpdates } from "../src/lib/events/updates";

const ORIGIN = "http://localhost:3000";
/** How much history the benchmarked user has. Higher makes N+1 loops obvious. */
const PEERS = Number(process.env.BENCH_PEERS ?? 8);
const SESSIONS = Number(process.env.BENCH_SESSIONS ?? 12);

type Case = { name: string; queries: number; ms: number };

async function measure(name: string, fn: () => Promise<unknown>): Promise<Case> {
  // Warm once so lazily-built prepared plans and pools are not in the sample.
  await fn();
  const before = perfSnapshot().queries;
  const startedAt = performance.now();
  await fn();
  const ms = performance.now() - startedAt;
  return { name, queries: perfSnapshot().queries - before, ms };
}

async function seed() {
  const db = getDb();
  const suffix = randomBytes(4).toString("hex");

  const [owner] = await db
    .insert(users)
    .values({
      clerkUserId: `clerk_bench_${suffix}`,
      email: `bench_${suffix}@example.com`,
      name: "Bench Owner",
    })
    .returning();

  const peers: User[] = [];
  const linkIds: string[] = [];
  for (let i = 0; i < PEERS; i += 1) {
    const [peer] = await db
      .insert(users)
      .values({
        clerkUserId: `clerk_bench_peer_${i}_${suffix}`,
        email: `bench_peer_${i}_${suffix}@example.com`,
        name: `Bench Peer ${i}`,
      })
      .returning();
    peers.push(peer);

    const invite = await createInviteLink({
      fromUser: owner,
      toEmail: peer.email,
      origin: ORIGIN,
    });
    const accepted = await acceptInviteLink({
      user: peer,
      inviteCode: invite.inviteCode,
      origin: ORIGIN,
    });
    linkIds.push(accepted.link.id);
  }

  for (let i = 0; i < SESSIONS; i += 1) {
    const session = await createSessionForUser({
      user: owner,
      intentType: "schedule_meeting",
      linkId: linkIds[i % linkIds.length],
      payload: { note: `bench ${i}` },
    });
    if (i % 3 === 0) {
      await requestConfirm({
        user: owner,
        sessionId: session.id,
        action: "book_meeting",
        note: `bench confirm ${i}`,
      });
    }
  }

  return { owner, peers, suffix };
}

async function cleanup(ids: string[]) {
  const db = getDb();
  // Everything benched hangs off these users by cascading foreign keys.
  await db.delete(users).where(inArray(users.id, ids));
}

function renderTable(rows: Case[]) {
  const width = Math.max(...rows.map((r) => r.name.length), 20);
  console.log(`\n${"path".padEnd(width)}  queries      time`);
  console.log("-".repeat(width + 20));
  for (const row of rows) {
    console.log(
      `${row.name.padEnd(width)}  ${String(row.queries).padStart(7)}  ${row.ms.toFixed(1).padStart(7)}ms`,
    );
  }
  const total = rows.reduce((sum, r) => sum + r.queries, 0);
  console.log("-".repeat(width + 20));
  console.log(`${"TOTAL".padEnd(width)}  ${String(total).padStart(7)}`);
}

function renderComparison(before: Case[], after: Case[]) {
  const byName = new Map(before.map((r) => [r.name, r]));
  const width = Math.max(...after.map((r) => r.name.length), 20);
  console.log(`\n${"path".padEnd(width)}       queries            time`);
  console.log("-".repeat(width + 34));
  for (const row of after) {
    const prev = byName.get(row.name);
    if (!prev) continue;
    const dq = row.queries - prev.queries;
    const sign = dq > 0 ? "+" : "";
    console.log(
      `${row.name.padEnd(width)}  ${String(prev.queries).padStart(4)} -> ${String(row.queries).padEnd(4)} (${sign}${dq})  ` +
        `${prev.ms.toFixed(0).padStart(5)}ms -> ${row.ms.toFixed(0).padStart(5)}ms`,
    );
  }
}

async function main() {
  const jsonOut = process.argv.includes("--json");
  const compareIndex = process.argv.indexOf("--compare");
  const comparePath = compareIndex >= 0 ? process.argv[compareIndex + 1] : null;

  const { owner, peers } = await seed();
  const rows: Case[] = [];

  try {
    // The /app shell runs on every authenticated navigation.
    rows.push(await measure("app layout: getHomeStatus", () => getHomeStatus(owner)));
    rows.push(
      await measure("app layout: listEventsWithUpdates", () =>
        listEventsWithUpdates(owner),
      ),
    );
    rows.push(await measure("/app/activity: listSessionsForUser", () => listSessionsForUser(owner)));
    rows.push(await measure("/app/people: listLinksForUser", () => listLinksForUser(owner, ORIGIN)));
    rows.push(
      await measure("/app/people: listPeopleMetThroughEvents", () =>
        listPeopleMetThroughEvents(owner),
      ),
    );
    rows.push(await measure("/app/attention: listConfirmsForUser", () => listConfirmsForUser(owner)));
  } finally {
    await cleanup([owner.id, ...peers.map((p) => p.id)]);
  }

  if (jsonOut) {
    console.log(JSON.stringify({ at: new Date().toISOString(), peers: PEERS, sessions: SESSIONS, rows }, null, 2));
  } else {
    console.log(`\npeers=${PEERS}  sessions=${SESSIONS}`);
    renderTable(rows);
    if (comparePath) {
      const { readFileSync } = await import("node:fs");
      renderComparison(JSON.parse(readFileSync(comparePath, "utf8")).rows, rows);
    }
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
