import { respondToInboundHiringRequest } from "@/lib/guest-tasks";
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
    const body = await readJsonBody<{ response?: Record<string, unknown> }>(
      request,
    );
    return jsonOk(
      await respondToInboundHiringRequest({
        user: auth.user,
        publicId,
        response: body.response,
        idempotencyKey: request.headers.get("idempotency-key"),
        actor: {
          userId: auth.user.id,
          apiKeyId: auth.apiKey.id,
          kind: "agent",
        },
      }),
    );
  } catch (error) {
    return jsonFromAgentError(error);
  }
}
