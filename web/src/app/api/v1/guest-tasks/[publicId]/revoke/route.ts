import { revokeGuestTask } from "@/lib/guest-tasks";
import { jsonFromAgentError, jsonOk, requireAgent } from "@/lib/http";
import { assertAgentScope } from "@/lib/scopes";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ publicId: string }> };

export async function POST(request: Request, context: Context) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;
  try {
    assertAgentScope(auth, "guest_tasks:write");
    const { publicId } = await context.params;
    return jsonOk({
      ok: true,
      task: await revokeGuestTask(auth.user, publicId, {
        kind: "agent",
        apiKeyId: auth.apiKey.id,
      }),
    });
  } catch (error) {
    return jsonFromAgentError(error);
  }
}
