import { perfSnapshot } from "@/lib/perf";

export const dynamic = "force-dynamic";

/**
 * Process-wide performance counters, for scripts/perf-baseline.mjs.
 *
 * Exposes counts only — no user data. Off in production unless explicitly
 * enabled, so it cannot become an accidental public surface.
 */
export async function GET() {
  const enabled =
    process.env.NODE_ENV !== "production" || process.env.PERF_ENDPOINT === "1";
  if (!enabled) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json(perfSnapshot(), {
    headers: { "Cache-Control": "no-store" },
  });
}
