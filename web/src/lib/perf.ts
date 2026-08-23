/**
 * Lightweight performance counters.
 *
 * The app had no timing or metrics of any kind, so a change could neither be
 * proved to help nor caught when it regressed. This module is dependency-free
 * and cheap enough to leave on in production.
 *
 * Query *count* is the headline metric: nearly every latency problem in this
 * codebase is "too many round trips" rather than "one slow query". Wall-clock
 * latency is measured from outside by scripts/perf-baseline.mjs; postgres.js
 * exposes no query-completion hook, so per-query duration is deliberately not
 * tracked here rather than being guessed at.
 */

export type PerfSnapshot = {
  /** Queries issued since the process started. */
  queries: number;
  /** Named external-call totals, e.g. { clerk: { count, totalMs } }. */
  external: Record<string, { count: number; totalMs: number }>;
  /** Milliseconds since the process started. */
  uptimeMs: number;
};

const counters = {
  queries: 0,
  external: new Map<string, { count: number; totalMs: number }>(),
  startedAt: Date.now(),
};

/** Set PERF_LOG=1 to log every query and external call. */
export function perfLoggingEnabled(): boolean {
  return process.env.PERF_LOG === "1";
}

export function countQuery(query?: string): void {
  counters.queries += 1;
  if (perfLoggingEnabled() && query) {
    console.log(`[perf] query #${counters.queries} ${query.slice(0, 160)}`);
  }
}

export function recordExternal(name: string, durationMs: number): void {
  const entry = counters.external.get(name) ?? { count: 0, totalMs: 0 };
  entry.count += 1;
  entry.totalMs += durationMs;
  counters.external.set(name, entry);
}

/**
 * Time an external call (Clerk, Google, Gemini, ...) and record it.
 * Failures are recorded too: a slow failure is the interesting case.
 */
export async function timed<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const startedAt = performance.now();
  try {
    return await fn();
  } finally {
    const durationMs = performance.now() - startedAt;
    recordExternal(name, durationMs);
    if (perfLoggingEnabled()) {
      console.log(`[perf] ${name} ${durationMs.toFixed(1)}ms`);
    }
  }
}

export function perfSnapshot(): PerfSnapshot {
  return {
    queries: counters.queries,
    external: Object.fromEntries(
      [...counters.external.entries()].map(([name, value]) => [
        name,
        { ...value },
      ]),
    ),
    uptimeMs: Date.now() - counters.startedAt,
  };
}
