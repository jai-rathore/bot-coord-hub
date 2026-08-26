import { reviseHiringGuestTask } from "@/lib/guest-tasks";
import {
  jsonFromAgentError,
  jsonOk,
  readJsonBody,
  requireAgent,
} from "@/lib/http";
import { assertAgentScope } from "@/lib/scopes";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ publicId: string }> };

export async function POST(request: Request, context: Context) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;
  try {
    assertAgentScope(auth, "guest_tasks:write");
    const { publicId } = await context.params;
    const body = await readJsonBody<{
      privateConfig?: Record<string, unknown>;
      candidateFacingUpdate?: string;
    }>(request);
    return jsonOk({
      ok: true,
      ...(await reviseHiringGuestTask({
        organizer: auth.user,
        publicId,
        privateConfig: body.privateConfig,
        candidateFacingUpdate: body.candidateFacingUpdate,
        actor: { kind: "agent", apiKeyId: auth.apiKey.id },
      })),
    });
  } catch (error) {
    return jsonFromAgentError(error);
  }
}
