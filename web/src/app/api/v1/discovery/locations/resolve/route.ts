import { resolveDiscoveryLocation } from "@/lib/agent-api";
import { jsonFromAgentError, jsonOk, requireAgent } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;
  try {
    const body = (await request.json()) as {
      query?: unknown;
      granularity?: unknown;
      countryCode?: unknown;
      limit?: unknown;
    };
    return jsonOk(await resolveDiscoveryLocation(auth, body));
  } catch (error) {
    return jsonFromAgentError(error);
  }
}
