#!/usr/bin/env node
/**
 * Latency + query-count baseline harness.
 *
 * Measures wall-clock TTFB from outside the app, and pairs each request with
 * the number of database queries it caused. Requests are issued serially, so
 * the delta of the process-wide query counter across a request is exactly that
 * request's query count (see src/lib/perf.ts and /api/v1/perf).
 *
 * Usage:
 *   node scripts/perf-baseline.mjs                        # against localhost:3000
 *   BASE_URL=http://127.0.0.1:3000 node scripts/perf-baseline.mjs
 *   PERF_RUNS=20 node scripts/perf-baseline.mjs
 *   PERF_OUT=perf-after.json node scripts/perf-baseline.mjs
 *   node scripts/perf-baseline.mjs --compare perf-before.json
 *
 * Signed-in routes need a Clerk session cookie:
 *   PERF_COOKIE='__session=...' node scripts/perf-baseline.mjs
 */

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const RUNS = Number(process.env.PERF_RUNS ?? 20);
const WARMUP = Number(process.env.PERF_WARMUP ?? 3);
const COOKIE = process.env.PERF_COOKIE ?? "";
const OUT = process.env.PERF_OUT ?? "";

/** handle/slug placeholders are substituted from the seeded data when present. */
const ROUTES = [
  { name: "/", path: "/", auth: false },
  { name: "/docs", path: "/docs", auth: false },
  { name: "/agents", path: "/agents", auth: false },
  { name: "/agents/tasks", path: "/agents/tasks", auth: false },
  { name: "/privacy", path: "/privacy", auth: false },
  { name: "/.well-known/agent-card.json", path: "/.well-known/agent-card.json", auth: false },
  { name: "/.well-known/honeymatcha.json", path: "/.well-known/honeymatcha.json", auth: false },
  { name: "/llms.txt", path: "/llms.txt", auth: false },
  { name: "/api/v1/health", path: "/api/v1/health", auth: false },
  { name: "/api/v1/openapi", path: "/api/v1/openapi", auth: false },
  { name: "/app/people", path: "/app/people", auth: true },
  { name: "/app/events", path: "/app/events", auth: true },
  { name: "/app/activity", path: "/app/activity", auth: true },
  { name: "/app/attention", path: "/app/attention", auth: true },
  { name: "/app/settings", path: "/app/settings", auth: true },
];

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

async function queryCount() {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/perf`, { cache: "no-store" });
    if (!res.ok) return null;
    const body = await res.json();
    return typeof body.queries === "number" ? body.queries : null;
  } catch {
    return null;
  }
}

/** Time to first byte: headers received, before the body is drained. */
async function timeOne(path) {
  const startedAt = performance.now();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      // Deliberately `*/*`. With placeholder Clerk keys an explicit
      // `Accept: text/html` triggers Clerk's dev-browser-missing handshake and
      // every route 307s, so nothing real gets measured. `*/*` still renders
      // HTML for pages and JSON for the agent API.
      Accept: "*/*",
      ...(COOKIE ? { Cookie: COOKIE } : {}),
    },
    redirect: "manual",
    cache: "no-store",
  });
  const ttfb = performance.now() - startedAt;
  await res.arrayBuffer();
  const total = performance.now() - startedAt;
  return { ttfb, total, status: res.status };
}

async function measure(route) {
  for (let i = 0; i < WARMUP; i += 1) {
    await timeOne(route.path).catch(() => {});
  }

  const samples = [];
  let status = 0;
  let queries = null;

  for (let i = 0; i < RUNS; i += 1) {
    const before = i === 0 ? await queryCount() : null;
    const result = await timeOne(route.path);
    if (i === 0 && before !== null) {
      const after = await queryCount();
      if (after !== null) queries = after - before;
    }
    samples.push(result);
    status = result.status;
  }

  const ttfbs = samples.map((s) => s.ttfb).sort((a, b) => a - b);
  const totals = samples.map((s) => s.total).sort((a, b) => a - b);
  return {
    name: route.name,
    status,
    queries,
    ttfbP50: percentile(ttfbs, 50),
    ttfbP95: percentile(ttfbs, 95),
    totalP50: percentile(totals, 50),
  };
}

function fmt(ms) {
  return `${ms.toFixed(0)}ms`.padStart(7);
}

function renderTable(rows) {
  const nameWidth = Math.max(...rows.map((r) => r.name.length), 6);
  console.log(
    `${"route".padEnd(nameWidth)}  status  queries  ttfb p50  ttfb p95  total p50`,
  );
  console.log("-".repeat(nameWidth + 46));
  for (const row of rows) {
    const q = row.queries === null ? "   n/a" : String(row.queries).padStart(6);
    console.log(
      `${row.name.padEnd(nameWidth)}  ${String(row.status).padStart(6)}  ${q}  ` +
        `${fmt(row.ttfbP50)}  ${fmt(row.ttfbP95)}  ${fmt(row.totalP50)}`,
    );
  }
}

function renderComparison(before, after) {
  const byName = new Map(before.map((r) => [r.name, r]));
  const nameWidth = Math.max(...after.map((r) => r.name.length), 6);
  console.log(`\n${"route".padEnd(nameWidth)}  queries      ttfb p50           delta`);
  console.log("-".repeat(nameWidth + 44));
  for (const row of after) {
    const prev = byName.get(row.name);
    if (!prev) continue;
    const qBefore = prev.queries === null ? "?" : prev.queries;
    const qAfter = row.queries === null ? "?" : row.queries;
    const delta = row.ttfbP50 - prev.ttfbP50;
    const pct = prev.ttfbP50 > 0 ? (delta / prev.ttfbP50) * 100 : 0;
    const sign = delta <= 0 ? "" : "+";
    console.log(
      `${row.name.padEnd(nameWidth)}  ${String(qBefore).padStart(3)} -> ${String(qAfter).padEnd(3)}  ` +
        `${fmt(prev.ttfbP50)} -> ${fmt(row.ttfbP50)}  ${sign}${delta.toFixed(0)}ms (${sign}${pct.toFixed(0)}%)`,
    );
  }
}

async function main() {
  const compareIndex = process.argv.indexOf("--compare");
  const comparePath = compareIndex >= 0 ? process.argv[compareIndex + 1] : null;

  const health = await fetch(`${BASE_URL}/api/v1/health`).catch(() => null);
  if (!health?.ok) {
    console.error(`No server at ${BASE_URL}. Start one with \`npm run dev\` or \`npm run start\`.`);
    process.exit(1);
  }

  if (!COOKIE) {
    console.log("PERF_COOKIE not set — /app routes will measure the sign-in redirect only.\n");
  }

  const rows = [];
  for (const route of ROUTES) {
    rows.push(await measure(route));
  }

  console.log(`\nBASE_URL=${BASE_URL}  runs=${RUNS}  warmup=${WARMUP}\n`);
  renderTable(rows);

  if (comparePath) {
    const { readFileSync } = await import("node:fs");
    renderComparison(JSON.parse(readFileSync(comparePath, "utf8")).rows, rows);
  }

  if (OUT) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(OUT, JSON.stringify({ baseUrl: BASE_URL, runs: RUNS, at: new Date().toISOString(), rows }, null, 2));
    console.log(`\nWrote ${OUT}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
