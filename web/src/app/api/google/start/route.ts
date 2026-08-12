import { ensureCurrentUser } from "@/lib/users";
import {
  googleAuthorizeUrl,
  googleCalendarEnabled,
  googleOAuthConfigured,
} from "@/lib/google-oauth";
import { requestOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET /api/google/start — begin Google Calendar OAuth for the signed-in user. */
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
  const url = googleAuthorizeUrl({
    userId: user.id,
    requestOrigin: origin,
  });
  return Response.redirect(url, 302);
}
