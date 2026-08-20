import { runTriageWorker } from "@/lib/triage";
import { canRunIntentTriage } from "@/lib/intent-moderation";
import { errorMessage, errorStatus } from "@/lib/http";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

/**
 * Signed-in triage path. Production fails closed unless INTENT_ADMIN_EMAILS
 * is set and the caller is on that list. Locally, any signed-in user may run
 * it when the list is unset.
 * POST /api/intents/triage  { limit?: number }
 */
export async function POST(request: Request) {
  const user = await ensureCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canRunIntentTriage(user)) {
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
