import {
  publishProposal,
  rejectProposal,
} from "@/lib/intent-moderation";
import { errorMessage, errorStatus } from "@/lib/http";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Publish or reject a pending intent proposal.
 * POST /api/intents/:id/decide  { action: "publish" | "reject", reason?: string }
 */
export async function POST(request: Request, { params }: Params) {
  const user = await ensureCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  let body: { action?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action?.trim().toLowerCase();
  try {
    if (action === "publish") {
      const proposal = await publishProposal({ user, proposalId: id });
      return Response.json({ ok: true, proposal });
    }
    if (action === "reject") {
      const proposal = await rejectProposal({
        user,
        proposalId: id,
        reason: body.reason ?? "",
      });
      return Response.json({ ok: true, proposal });
    }
    return Response.json(
      { error: 'action must be "publish" or "reject"' },
      { status: 400 },
    );
  } catch (err) {
    return Response.json(
      { error: errorMessage(err) },
      { status: errorStatus(err) },
    );
  }
}
