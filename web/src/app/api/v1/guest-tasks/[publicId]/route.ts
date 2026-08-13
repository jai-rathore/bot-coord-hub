import { getGuestTaskForOrganizer } from "@/lib/guest-tasks";
import { jsonFromAgentError, jsonOk, requireAgent } from "@/lib/http";
import { assertAgentScope } from "@/lib/scopes";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ publicId: string }> };

export async function GET(request: Request, context: Context) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;
  try {
    assertAgentScope(auth, "guest_tasks:read");
    const { publicId } = await context.params;
    return jsonOk({
      ok: true,
      ...(await getGuestTaskForOrganizer(auth.user, publicId)),
    });
  } catch (error) {
    return jsonFromAgentError(error);
  }
}
