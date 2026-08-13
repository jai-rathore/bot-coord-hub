import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { calendarConnections, type CalendarConnection, type User } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/secret-crypto";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
].join(" ");

export function googleOAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );
}

export function googleCalendarEnabled(): boolean {
  return (
    process.env.GOOGLE_CALENDAR_ENABLED === "true" ||
    process.env.GOOGLE_CALENDAR_ENABLED === "1"
  );
}

export function googleRedirectUri(requestOrigin?: string): string {
  if (process.env.GOOGLE_REDIRECT_URI) {
    return process.env.GOOGLE_REDIRECT_URI;
  }
  // Prefer production hosts when known; allow request origin for local.
  if (requestOrigin?.includes("honeymatcha.io")) {
    return "https://honeymatcha.io/api/google/callback";
  }
  if (requestOrigin?.includes("onrender.com")) {
    return "https://honeymatcha-web.onrender.com/api/google/callback";
  }
  if (requestOrigin) {
    return `${requestOrigin.replace(/\/$/, "")}/api/google/callback`;
  }
  return "https://honeymatcha-web.onrender.com/api/google/callback";
}

const OAUTH_STATE_TTL_MS = 10 * 60 * 1_000;

function oauthStateSecret(): string {
  const secret =
    process.env.OAUTH_STATE_SECRET ??
    process.env.CLERK_SECRET_KEY ??
    process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new Error("OAUTH_STATE_SECRET is required");
  return secret;
}

/** Expiring HMAC state bound to a nonce cookie in the browser. */
export function buildOAuthState(userId: string): {
  state: string;
  nonce: string;
} {
  const nonce = randomBytes(16).toString("hex");
  const timestamp = Date.now().toString(36);
  const payload = `${userId}.${timestamp}.${nonce}`;
  const sig = createHmac("sha256", oauthStateSecret())
    .update(payload)
    .digest("base64url");
  return { state: `${payload}.${sig}`, nonce };
}

export function parseOAuthState(
  state: string,
  expectedNonce: string | null,
): string | null {
  const parts = state.split(".");
  if (parts.length !== 4) return null;
  const [userId, timestamp, nonce, sig] = parts;
  if (!userId || !timestamp || !nonce || !sig || nonce !== expectedNonce) {
    return null;
  }
  const issuedAt = Number.parseInt(timestamp, 36);
  if (
    !Number.isFinite(issuedAt) ||
    issuedAt > Date.now() + 60_000 ||
    Date.now() - issuedAt > OAUTH_STATE_TTL_MS
  ) {
    return null;
  }
  const expected = createHmac("sha256", oauthStateSecret())
    .update(`${userId}.${timestamp}.${nonce}`)
    .digest();
  const supplied = Buffer.from(sig, "base64url");
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    return null;
  }
  return userId;
}

export function googleAuthorizeUrl(opts: {
  userId: string;
  requestOrigin?: string;
}): { url: string; nonce: string } {
  const { state, nonce } = buildOAuthState(opts.userId);
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: googleRedirectUri(opts.requestOrigin),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
    include_granted_scopes: "true",
  });
  return { url: `${GOOGLE_AUTH}?${params.toString()}`, nonce };
}

export async function exchangeCodeForTokens(
  code: string,
  requestOrigin?: string,
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date | null;
  email: string | null;
  scopes: string | null;
}> {
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    redirect_uri: googleRedirectUri(requestOrigin),
    grant_type: "authorization_code",
  });
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw Object.assign(new Error(`Google token exchange failed: ${text}`), {
      status: 502,
    });
  }
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    id_token?: string;
  };
  if (!data.access_token) {
    throw Object.assign(new Error("Google did not return access_token"), {
      status: 502,
    });
  }

  let email: string | null = null;
  try {
    const infoRes = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      { headers: { Authorization: `Bearer ${data.access_token}` } },
    );
    if (infoRes.ok) {
      const info = (await infoRes.json()) as { email?: string };
      email = info.email ?? null;
    }
  } catch {
    // optional
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? "",
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : null,
    email,
    scopes: data.scope ?? SCOPES,
  };
}

export async function upsertGoogleConnection(
  user: User,
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresAt: Date | null;
    email: string | null;
    scopes: string | null;
  },
): Promise<CalendarConnection> {
  const db = getDb();
  const existing = await db
    .select()
    .from(calendarConnections)
    .where(
      and(
        eq(calendarConnections.userId, user.id),
        eq(calendarConnections.provider, "google"),
      ),
    )
    .limit(1);

  if (existing[0]) {
    const refreshToken =
      tokens.refreshToken || existing[0].refreshToken;
    const [updated] = await db
      .update(calendarConnections)
      .set({
        accessToken: encryptSecret(tokens.accessToken),
        refreshToken: encryptSecret(refreshToken),
        tokenExpiresAt: tokens.expiresAt,
        googleAccountEmail: tokens.email ?? existing[0].googleAccountEmail,
        scopes: tokens.scopes,
        updatedAt: new Date(),
      })
      .where(eq(calendarConnections.id, existing[0].id))
      .returning();
    return updated;
  }

  if (!tokens.refreshToken) {
    throw Object.assign(
      new Error(
        "Google did not return a refresh_token. Revoke app access and reconnect with consent.",
      ),
      { status: 400 },
    );
  }

  const [created] = await db
    .insert(calendarConnections)
    .values({
      userId: user.id,
      provider: "google",
      accessToken: encryptSecret(tokens.accessToken),
      refreshToken: encryptSecret(tokens.refreshToken),
      tokenExpiresAt: tokens.expiresAt,
      googleAccountEmail: tokens.email,
      scopes: tokens.scopes,
      calendarId: "primary",
    })
    .returning();
  return created;
}

export async function getGoogleConnection(
  userId: string,
): Promise<CalendarConnection | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(calendarConnections)
    .where(
      and(
        eq(calendarConnections.userId, userId),
        eq(calendarConnections.provider, "google"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function disconnectGoogle(userId: string): Promise<boolean> {
  const db = getDb();
  const [connection] = await db
    .select()
    .from(calendarConnections)
    .where(
      and(
        eq(calendarConnections.userId, userId),
        eq(calendarConnections.provider, "google"),
      ),
    )
    .limit(1);
  if (connection) {
    const token = decryptSecret(
      connection.refreshToken || connection.accessToken,
    );
    try {
      await fetch(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        },
      );
    } catch {
      // Local deletion still revokes HoneyMatcha access; surface errors in logs.
      console.error("[calendar] Google token revocation request failed");
    }
  }
  const deleted = await db
    .delete(calendarConnections)
    .where(
      and(
        eq(calendarConnections.userId, userId),
        eq(calendarConnections.provider, "google"),
      ),
    )
    .returning({ id: calendarConnections.id });
  return deleted.length > 0;
}

/** Refresh access token if expired; returns usable access token. */
export async function getValidGoogleAccessToken(
  connection: CalendarConnection,
): Promise<string> {
  const expiresAt = connection.tokenExpiresAt?.getTime() ?? 0;
  if (expiresAt > Date.now() + 60_000) {
    return decryptSecret(connection.accessToken);
  }

  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    refresh_token: decryptSecret(connection.refreshToken),
    grant_type: "refresh_token",
  });
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token refresh failed: ${text}`);
  }
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) {
    throw new Error("Google refresh returned no access_token");
  }

  const db = getDb();
  await db
    .update(calendarConnections)
    .set({
      accessToken: encryptSecret(data.access_token),
      tokenExpiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : null,
      updatedAt: new Date(),
    })
    .where(eq(calendarConnections.id, connection.id));

  return data.access_token;
}
