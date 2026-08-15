import { listDiscoveryCapabilities } from "@/lib/agent-api";
import { jsonFromAgentError, jsonOk, requireAgent } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;
  try {
    return jsonOk(await listDiscoveryCapabilities(auth));
  } catch (error) {
    return jsonFromAgentError(error);
  }
}
