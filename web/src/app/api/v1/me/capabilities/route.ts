import { setDiscoveryCapabilityManifest } from "@/lib/agent-api";
import {
  jsonFromAgentError,
  jsonOk,
  readJsonBody,
  requireAgent,
} from "@/lib/http";

export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;
  try {
    const body = await readJsonBody<{
      supportedIntents?: unknown;
      platforms?: unknown;
      metadata?: unknown;
    }>(request);
    return jsonOk(await setDiscoveryCapabilityManifest(auth, body));
  } catch (error) {
    return jsonFromAgentError(error);
  }
}
