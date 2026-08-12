import { runTriageWorker } from "@/lib/triage";
import { isIntentAdmin } from "@/lib/intent-moderation";
import { errorMessage, errorStatus } from "@/lib/http";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

/**
 * Signed-in triage path (admin or any signed-in user when INTENT_ADMIN_EMAILS unset).
 * Uses heuristic + optional OPENAI/GROK keys. Does not publish.
 * POST /api/intents/triage  { limit?: number }
 */
export async function POST(request: Request) {
  const user = await ensureCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminsConfigured = Boolean(process.env.INTENT_ADMIN_EMAILS?.trim());
  if (adminsConfigured && !isIntentAdmin(user)) {
    return Response.json(
      { error: "Only intent admins can run triage" },
      { status: 403 },
    );
  }

  let limit = 10;
  try {
    const body = (await request.json()) as { limit?: number };
    if (typeof body.limit === "number") limit = body.limit;
  } catch {
    // empty body ok
  }

  try {
    const out = await runTriageWorker({ limit, actorUserId: user.id });
    return Response.json({ ok: true, ...out });
  } catch (err) {
    return Response.json(
      { error: errorMessage(err) },
      { status: errorStatus(err, 500) },
    );
  }
}
