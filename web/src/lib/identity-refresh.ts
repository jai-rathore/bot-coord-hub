const DEFAULT_IDENTITY_REFRESH_MS = 10 * 60 * 1000;

/**
 * How long a locally-stored identity is trusted before being re-read from
 * Clerk. Empty or non-numeric IDENTITY_REFRESH_MS used to become 0 / NaN,
 * which either refreshed on every request or never refreshed at all.
 */
export function identityRefreshWindowMs(
  raw: string | undefined = process.env.IDENTITY_REFRESH_MS,
): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_IDENTITY_REFRESH_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_IDENTITY_REFRESH_MS;
}

export function identityIsStale(
  user: { updatedAt: Date | string },
  now = Date.now(),
  windowMs = identityRefreshWindowMs(),
): boolean {
  const updatedMs =
    user.updatedAt instanceof Date
      ? user.updatedAt.getTime()
      : Date.parse(String(user.updatedAt));
  if (!Number.isFinite(updatedMs)) return true;
  return now - updatedMs > windowMs;
}
