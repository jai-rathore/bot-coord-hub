import { patchLinkPolicy } from "@/lib/agent-api";
import {
  jsonFromAgentError,
  jsonOk,
  readJsonBody,
  requestBaseUrl,
  requireAgent,
} from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH /api/v1/links/:id — update per-link policies
 * (confirmRequired, timezone, allowedHours).
 */
export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;

  try {
    const { id } = await params;
    const body = await readJsonBody<{
      confirmRequired?: boolean;
      timezone?: string | null;
      allowedHours?: {
        start: string;
        end: string;
        days?: number[];
      } | null;
    }>(request);
    return jsonOk(
      await patchLinkPolicy(auth, id, body, requestBaseUrl(request)),
    );
  } catch (err) {
    return jsonFromAgentError(err);
  }
}
