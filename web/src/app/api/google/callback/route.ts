import { eq } from "drizzle-orm";
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

/** GET /api/google/callback — OAuth redirect handler. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const appBase = requestOrigin(request);
  const fail = (msg: string) =>
    Response.redirect(
      `${appBase}/app/settings?calendar=error&message=${encodeURIComponent(msg)}`,
      302,
    );

  if (oauthError) {
    return fail(oauthError);
  }
  if (!code || !state) {
    return fail("Missing code or state");
  }

  const userId = parseOAuthState(state);
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
    return Response.redirect(`${appBase}/app/settings?calendar=connected`, 302);
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth failed";
    return fail(message);
  }
}
