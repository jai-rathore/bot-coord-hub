import {
  blockDiscoveryMatch,
  reportDiscoveryMatch,
} from "@/lib/agent-api";
import {
  jsonFromAgentError,
  jsonOk,
  readJsonBody,
  requireAgent,
} from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;
  try {
    const { id } = await context.params;
    const body = await readJsonBody<{
      action?: unknown;
      reasonCode?: unknown;
      details?: unknown;
      block?: boolean;
    }>(request);
    if (body.action === "block") {
      return jsonOk(
        await blockDiscoveryMatch(auth, {
          interestId: id,
          reasonCode: body.reasonCode,
        }),
      );
    }
    if (body.action === "report") {
      return jsonOk(
        await reportDiscoveryMatch(auth, {
          interestId: id,
          reasonCode: body.reasonCode,
          details: body.details,
          block: body.block,
        }),
      );
    }
    return Response.json(
      { error: "action must be block or report" },
      { status: 400 },
    );
  } catch (error) {
    return jsonFromAgentError(error);
  }
}
