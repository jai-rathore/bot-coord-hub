import { AgentApiError } from "@/lib/agent-errors";
import { readJsonBody } from "@/lib/http";
import {
  jsonCors,
  optionsCors,
  registerOAuthClient,
  withCors,
} from "@/lib/mcp-oauth";
import {
  pairingRateLimitKey,
  rateLimit,
  rateLimitedJson,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return optionsCors();
}

export async function POST(request: Request) {
  const rate = rateLimit(pairingRateLimitKey(request), 20);
  if (!rate.ok) return withCors(rateLimitedJson(rate));

  try {
    const body = await readJsonBody<{
      client_name?: string;
      redirect_uris?: string[];
      token_endpoint_auth_method?: string;
    }>(request);
    const registered = await registerOAuthClient({
      clientName: body.client_name,
      redirectUris: body.redirect_uris,
      tokenEndpointAuthMethod: body.token_endpoint_auth_method,
    });
    return jsonCors(registered, 201);
  } catch (error) {
    if (error instanceof AgentApiError) {
      return jsonCors(
        {
          error: error.message,
          ...(error.details ?? {}),
        },
        error.status,
      );
    }
    console.error("[oauth] register failed", error);
    return jsonCors({ error: "Internal server error" }, 500);
  }
}
