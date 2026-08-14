import { createClient, type RedisClientType } from "redis";
import { rateLimit, type RateLimitResult } from "@/lib/rate-limit";

declare global {
  // eslint-disable-next-line no-var
  var __honeymatchaRedisClient: RedisClientType | undefined;
}

function redisUrl(): string | null {
  return process.env.REDIS_URL?.trim() || null;
}

async function redisClient(): Promise<RedisClientType | null> {
  const url = redisUrl();
  if (!url) return null;
  if (!globalThis.__honeymatchaRedisClient) {
    globalThis.__honeymatchaRedisClient = createClient({ url });
    globalThis.__honeymatchaRedisClient.on("error", (error) => {
      console.error("[rate-limit] shared limiter error", error);
    });
  }
  const client = globalThis.__honeymatchaRedisClient;
  if (!client.isOpen) await client.connect();
  return client;
}

/**
 * Shared fixed-window limiter for privacy-sensitive discovery operations.
 * Production fails closed if Valkey is unavailable; local development uses the
 * existing in-memory limiter so the app remains self-contained.
 */
export async function distributedRateLimit(
  key: string,
  limit: number,
  windowMs = 60_000,
): Promise<RateLimitResult> {
  const client = await redisClient();
  if (!client) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("REDIS_URL is required for discovery operations");
    }
    return rateLimit(`discovery:${key}`, limit, windowMs);
  }
  try {
    const bucket = `hm:rate:${key}:${Math.floor(Date.now() / windowMs)}`;
    const count = await client.incr(bucket);
    if (count === 1) await client.pExpire(bucket, windowMs);
    const ttl = Math.max(await client.pTTL(bucket), 1);
    const resetAt = Date.now() + ttl;
    if (count > limit) {
      return {
        ok: false,
        remaining: 0,
        resetAt,
        retryAfterSec: Math.max(1, Math.ceil(ttl / 1000)),
      };
    }
    return {
      ok: true,
      remaining: Math.max(limit - count, 0),
      resetAt,
    };
  } catch (error) {
    if (process.env.NODE_ENV === "production") throw error;
    return rateLimit(`discovery:${key}`, limit, windowMs);
  }
}
