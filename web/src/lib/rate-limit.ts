/**
 * Lightweight in-memory token-bucket style limiter for /api/v1/*.
 * Resets on process restart — fine for single-instance / free-tier deploys.
 */

type Bucket = {
  tokens: number;
  updatedAt: number;
};

const buckets = new Map<string, Bucket>();
let operationsSincePrune = 0;

const DEFAULT_WINDOW_MS = 60_000;

function defaultLimit() {
  const n = Number(process.env.AGENT_RATE_LIMIT_PER_MIN ?? "60");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 60;
}

export type RateLimitResult =
  | { ok: true; remaining: number; resetAt: number }
  | { ok: false; remaining: number; resetAt: number; retryAfterSec: number };

/**
 * Token bucket refilled over `windowMs`. Capacity = `limit` tokens/window.
 */
export function rateLimit(
  key: string,
  limit = defaultLimit(),
  windowMs = DEFAULT_WINDOW_MS,
): RateLimitResult {
  const now = Date.now();
  operationsSincePrune += 1;
  if (operationsSincePrune >= 100) {
    operationsSincePrune = 0;
    const staleBefore = now - Math.max(windowMs * 5, 5 * 60_000);
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.updatedAt < staleBefore) buckets.delete(bucketKey);
    }
  }
  const existing = buckets.get(key);
  const refillPerMs = limit / windowMs;

  if (!existing) {
    buckets.set(key, { tokens: limit - 1, updatedAt: now });
    return { ok: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  const elapsed = Math.max(0, now - existing.updatedAt);
  const refilled = Math.min(limit, existing.tokens + elapsed * refillPerMs);
  const resetAt = now + Math.ceil(((limit - Math.max(0, refilled - 1)) / refillPerMs));

  if (refilled < 1) {
    const retryAfterSec = Math.max(1, Math.ceil((1 - refilled) / refillPerMs / 1000));
    buckets.set(key, { tokens: refilled, updatedAt: now });
    return {
      ok: false,
      remaining: 0,
      resetAt,
      retryAfterSec,
    };
  }

  const tokens = refilled - 1;
  buckets.set(key, { tokens, updatedAt: now });
  return {
    ok: true,
    remaining: Math.floor(tokens),
    resetAt,
  };
}

export function clientIpFromHeaders(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

/** Bucket key: IP + optional bearer token fingerprint (prefix). */
export function agentRateLimitKey(request: Request): string {
  const ip = clientIpFromHeaders(request.headers);
  const auth = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)/i.exec(auth.trim());
  const token = match?.[1] ?? "";
  const keyPart = token ? token.slice(0, 16) : "anon";
  return `v1:${ip}:${keyPart}`;
}

export function guestRateLimitKey(
  request: Request,
  tokenPrefix = "anonymous",
): string {
  return `guest:${clientIpFromHeaders(request.headers)}:${tokenPrefix}`;
}

export function pairingRateLimitKey(request: Request): string {
  return `pairing:${clientIpFromHeaders(request.headers)}`;
}

export function rateLimitHeaders(result: RateLimitResult): HeadersInit {
  return {
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
    ...(result.ok ? {} : { "Retry-After": String(result.retryAfterSec) }),
  };
}

export function rateLimitedJson(
  result: Extract<RateLimitResult, { ok: false }>,
) {
  return Response.json(
    {
      error: "Rate limit exceeded",
      code: "rate_limited",
      retryAfterSec: result.retryAfterSec,
    },
    { status: 429, headers: rateLimitHeaders(result) },
  );
}
