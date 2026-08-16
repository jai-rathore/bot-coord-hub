import { getAgentProfile } from "@/lib/agent-api";
import { jsonFromAgentError, jsonOk, requestBaseUrl } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ handle: string }> },
) {
  const { handle } = await context.params;
  try {
    return jsonOk(await getAgentProfile(handle, requestBaseUrl(request)), 200, {
      "Cache-Control": "public, max-age=60",
      "Access-Control-Allow-Origin": "*",
    });
  } catch (err) {
    return jsonFromAgentError(err);
  }
}
