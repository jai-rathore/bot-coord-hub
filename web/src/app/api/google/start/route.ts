import { ensureCurrentUser } from "@/lib/users";
import { NextResponse } from "next/server";
import {
  googleAuthorizeUrl,
  googleCalendarEnabled,
  googleOAuthConfigured,
} from "@/lib/google-oauth";
import { requestOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET /api/google/start: begin Google Calendar OAuth for the signed-in user. */
export async function GET(request: Request) {
  const user = await ensureCurrentUser();
  if (!user) {
    return Response.redirect(new URL("/sign-in", request.url), 302);
  }

  if (!googleCalendarEnabled() || !googleOAuthConfigured()) {
    return Response.json(
      {
        error:
          "Google Calendar is not enabled. Set GOOGLE_CALENDAR_ENABLED=true and GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.",
      },
      { status: 503 },
    );
  }

  const origin = requestOrigin(request);
  const authorization = googleAuthorizeUrl({
    userId: user.id,
    requestOrigin: origin,
  });
  const response = NextResponse.redirect(authorization.url, 302);
  response.cookies.set("hm_google_oauth_nonce", authorization.nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/google/callback",
    maxAge: 10 * 60,
  });
  return response;
}
