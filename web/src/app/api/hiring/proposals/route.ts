import { createHiringProposalForHandle } from "@/lib/guest-tasks";
import { jsonError, requestBaseUrl } from "@/lib/http";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await ensureCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await request.json()) as {
      targetHandle?: unknown;
      title?: unknown;
      description?: unknown;
      privateConfig?: unknown;
      idempotencyKey?: unknown;
    };
    const proposal = await createHiringProposalForHandle({
      organizer: user,
      targetHandle: body.targetHandle,
      title: body.title,
      description: body.description,
      privateConfig: body.privateConfig,
      idempotencyKey: body.idempotencyKey,
      origin: requestBaseUrl(request),
      actor: { kind: "user" },
    });
    return Response.json(proposal, { status: 201 });
  } catch (error) {
    return jsonError(
      error,
      "Could not send this role to the candidate's agent",
    );
  }
}
