import { runTriageWorker, assertTriageSecret } from "@/lib/triage";
import { jsonOk } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Intent triage worker.
 * POST /api/v1/intents/triage
 * Auth: header `X-Triage-Secret: $TRIAGE_SECRET` (or Authorization: Bearer $TRIAGE_SECRET)
 *
 * Writes recommendation + reason on queued pending proposals.
 * Does NOT publish or reject.
 */
export async function POST(request: Request) {
  if (!process.env.TRIAGE_SECRET?.trim()) {
    return Response.json(
      {
        error:
          "TRIAGE_SECRET is not configured. Set it to enable the cron/worker path.",
      },
      { status: 503 },
    );
  }
  if (!assertTriageSecret(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let limit = 10;
    try {
      const body = (await request.json()) as { limit?: number };
      if (typeof body?.limit === "number") limit = body.limit;
    } catch {
      // empty / non-JSON body ok
    }
    const out = await runTriageWorker({ limit });
    return jsonOk({ ok: true, ...out });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Triage failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
