import {
  jsonFromAgentError,
  jsonOk,
  readJsonBody,
  requestBaseUrl,
  requireAgent,
} from "@/lib/http";
import {
  createGuestTask,
  listGuestTasksForOrganizer,
} from "@/lib/guest-tasks";
import { assertAgentScope } from "@/lib/scopes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;
  try {
    assertAgentScope(auth, "guest_tasks:read");
    return jsonOk({
      ok: true,
      tasks: await listGuestTasksForOrganizer(auth.user),
    });
  } catch (error) {
    return jsonFromAgentError(error);
  }
}

export async function POST(request: Request) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;
  try {
    assertAgentScope(auth, "guest_tasks:write");
    const body = await readJsonBody<{
      taskType?: string;
      title?: string;
      description?: string;
      config?: Record<string, unknown>;
      targetEmail?: string;
      expiresInMinutes?: number;
      maxResponses?: number;
      sessionId?: string;
    }>(request);
    const result = await createGuestTask({
      organizer: auth.user,
      taskType: body.taskType,
      title: body.title,
      description: body.description,
      config: body.config,
      targetEmail: body.targetEmail,
      expiresInMinutes: body.expiresInMinutes,
      maxResponses: body.maxResponses,
      sessionId: body.sessionId,
      origin: requestBaseUrl(request),
      actor: { kind: "agent", apiKeyId: auth.apiKey.id },
    });
    return jsonOk({ ok: true, ...result }, 201);
  } catch (error) {
    return jsonFromAgentError(error);
  }
}
