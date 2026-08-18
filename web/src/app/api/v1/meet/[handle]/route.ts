import {
  isAgentAuth,
  jsonFromAgentError,
  readJsonBody,
  requireAgent,
  requestBaseUrl,
} from "@/lib/http";
import { agentRecordMeeting } from "@/lib/events/agent-api";

export const dynamic = "force-dynamic";

/** REST twin of the record_meeting MCP tool. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ handle: string }> },
) {
  const auth = await requireAgent(request);
  if (!isAgentAuth(auth)) return auth;
  try {
    const { handle } = await params;
    const body = await readJsonBody(request);
    return Response.json(
      await agentRecordMeeting(
        auth,
        { ...body, handle },
        requestBaseUrl(request),
      ),
    );
  } catch (err) {
    return jsonFromAgentError(err);
  }
}
