import { createClient, type RedisClientType } from "redis";
import { rateLimit, type RateLimitResult } from "@/lib/rate-limit";

declare global {
  var __honeymatchaRedisClient: RedisClientType | undefined;
}

function redisUrl(): string | null {
  return process.env.REDIS_URL?.trim() || null;
}

async function redisClient(): Promise<RedisClientType | null> {
  const url = redisUrl();
  if (!url) return null;
  if (!globalThis.__honeymatchaRedisClient) {
    globalThis.__honeymatchaRedisClient = createClient({
      url,
      disableOfflineQueue: true,
      socket: {
        connectTimeout: 1_500,
        reconnectStrategy: false,
      },
    });
    globalThis.__honeymatchaRedisClient.on("error", (error) => {
      console.error("[rate-limit] shared limiter error", error);
    });
  }
  const client = globalThis.__honeymatchaRedisClient;
  if (!client.isOpen) await client.connect();
  return client;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs = 2_000) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Shared rate limiter timed out")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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
  try {
    const client = await withTimeout(redisClient());
    if (!client) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("Shared rate limiter is not configured");
      }
      return rateLimit(`discovery:${key}`, limit, windowMs);
    }
    const bucket = `hm:rate:${key}:${Math.floor(Date.now() / windowMs)}`;
    const count = await withTimeout(client.incr(bucket));
    if (count === 1) await withTimeout(client.pExpire(bucket, windowMs));
    const ttl = Math.max(await withTimeout(client.pTTL(bucket)), 1);
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
    const client = globalThis.__honeymatchaRedisClient;
    if (client) {
      if (client.isOpen) client.destroy();
      globalThis.__honeymatchaRedisClient = undefined;
    }
    if (process.env.NODE_ENV === "production") {
      console.error("[rate-limit] discovery limiter unavailable", error);
      throw new Error("Discovery rate limiter is temporarily unavailable");
    }
    return rateLimit(`discovery:${key}`, limit, windowMs);
  }
}
