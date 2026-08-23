import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import {
  exchangeCodeForTokens,
  parseOAuthState,
  upsertGoogleConnection,
} from "@/lib/google-oauth";
import { requestOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET /api/google/callback: OAuth redirect handler. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const appBase = requestOrigin(request);
  const redirectAndClear = (url: string) => {
    const response = NextResponse.redirect(url, 302);
    response.cookies.set("hm_google_oauth_nonce", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/google/callback",
      maxAge: 0,
    });
    return response;
  };
  const fail = (msg: string) =>
    redirectAndClear(
      `${appBase}/app/settings?calendar=error&message=${encodeURIComponent(msg)}`,
    );

  if (oauthError) {
    return fail(oauthError);
  }
  if (!code || !state) {
    return fail("Missing code or state");
  }

  const nonceCookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("hm_google_oauth_nonce="))
    ?.slice("hm_google_oauth_nonce=".length);
  const userId = parseOAuthState(
    state,
    nonceCookie ? decodeURIComponent(nonceCookie) : null,
  );
  if (!userId) {
    return fail("Invalid OAuth state");
  }

  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) {
    return fail("User not found");
  }

  // HMAC state + nonce cookie are not a Clerk session. Bind the callback to
  // the signed-in browser so a stolen state cannot attach calendar tokens
  // to someone else's account.
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId || clerkUserId !== user.clerkUserId) {
    return fail("Sign in to finish connecting Google Calendar");
  }

  try {
    const tokens = await exchangeCodeForTokens(code, appBase);
    const conn = await upsertGoogleConnection(user, tokens);
    await writeAudit({
      actorUserId: user.id,
      action: "calendar.connect",
      entityType: "calendar_connection",
      entityId: conn.id,
      metadata: {
        provider: "google",
        email: conn.googleAccountEmail,
      },
    });
    return redirectAndClear(`${appBase}/app/settings?calendar=connected`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth failed";
    return fail(message);
  }
}
