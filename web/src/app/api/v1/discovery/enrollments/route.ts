import { submitDiscoveryProfile } from "@/lib/agent-api";
import {
  jsonFromAgentError,
  jsonOk,
  readJsonBody,
  requireAgent,
} from "@/lib/http";
import type { CoarseLocationInput } from "@/lib/discovery-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;
  try {
    const body = await readJsonBody<{
      intentSlug?: unknown;
      claims?: unknown;
      provenance?: unknown;
      location?: CoarseLocationInput | null;
      requestActivation?: unknown;
    }>(request);
    return jsonOk(await submitDiscoveryProfile(auth, body), 201);
  } catch (error) {
    return jsonFromAgentError(error);
  }
}
