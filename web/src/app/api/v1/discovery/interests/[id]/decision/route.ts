import { respondDiscoveryInterest } from "@/lib/agent-api";
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
    const body = await readJsonBody<{ decision?: unknown }>(request);
    return jsonOk(
      await respondDiscoveryInterest(auth, {
        interestId: id,
        decision: body.decision,
      }),
    );
  } catch (error) {
    return jsonFromAgentError(error);
  }
}
