import { createHash, randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { calendarConnections, type CalendarConnection, type User } from "@/db/schema";

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

/** Signed-ish state: userId.nonce.hmac */
export function buildOAuthState(userId: string): string {
  const nonce = randomBytes(16).toString("hex");
  const secret =
    process.env.CLERK_SECRET_KEY ||
    process.env.GOOGLE_CLIENT_SECRET ||
    "honeymatcha";
  const payload = `${userId}.${nonce}`;
  const sig = createHash("sha256")
    .update(`${payload}.${secret}`)
    .digest("hex")
    .slice(0, 32);
  return `${payload}.${sig}`;
}

export function parseOAuthState(state: string): string | null {
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [userId, nonce, sig] = parts;
  if (!userId || !nonce || !sig) return null;
  const secret =
    process.env.CLERK_SECRET_KEY ||
    process.env.GOOGLE_CLIENT_SECRET ||
    "honeymatcha";
  const expected = createHash("sha256")
    .update(`${userId}.${nonce}.${secret}`)
    .digest("hex")
    .slice(0, 32);
  if (expected !== sig) return null;
  return userId;
}

export function googleAuthorizeUrl(opts: {
  userId: string;
  requestOrigin?: string;
}): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: googleRedirectUri(opts.requestOrigin),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state: buildOAuthState(opts.userId),
    include_granted_scopes: "true",
  });
  return `${GOOGLE_AUTH}?${params.toString()}`;
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
        accessToken: tokens.accessToken,
        refreshToken,
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
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
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
    return connection.accessToken;
  }

  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    refresh_token: connection.refreshToken,
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
      accessToken: data.access_token,
      tokenExpiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : null,
      updatedAt: new Date(),
    })
    .where(eq(calendarConnections.id, connection.id));

  return data.access_token;
}
