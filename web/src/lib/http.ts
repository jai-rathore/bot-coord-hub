import {
  authenticateAgent,
  unauthorizedJson,
  type AgentAuth,
} from "@/lib/agent-auth";
import { AgentApiError } from "@/lib/agent-api";
import {
  agentRateLimitKey,
  rateLimit,
  rateLimitedJson,
  rateLimitHeaders,
} from "@/lib/rate-limit";

export async function readJsonBody<T extends Record<string, unknown>>(
  request: Request,
): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new AgentApiError(400, "Invalid JSON body");
  }
}

export function jsonOk(
  data: unknown,
  status = 200,
  extraHeaders?: HeadersInit,
) {
  return Response.json(data, {
    status,
    headers: extraHeaders,
  });
}

/**
 * Authenticate Bearer agent key + light in-memory rate limit (IP+key).
 * Revoked keys fail here immediately (authenticateAgent filters revoked_at).
 */
export async function requireAgent(
  request: Request,
): Promise<AgentAuth | Response> {
  const rate = rateLimit(agentRateLimitKey(request));
  if (!rate.ok) return rateLimitedJson(rate);

  const auth = await authenticateAgent(request);
  if (!auth) {
    const base = requestBaseUrl(request);
    return unauthorizedJson(
      "Unauthorized",
      `${base}/.well-known/oauth-protected-resource`,
    );
  }

  // Stash headers for callers that want to forward them.
  void rateLimitHeaders(rate);
  return auth;
}

export function isAgentAuth(value: AgentAuth | Response): value is AgentAuth {
  return !(value instanceof Response);
}

export function jsonFromAgentError(err: unknown) {
  if (err instanceof AgentApiError) {
    return Response.json(
      { error: err.message, ...(err.details ?? {}) },
      { status: err.status },
    );
  }
  console.error("[http] unexpected agent API error", err);
  const status = errorStatus(err, 500);
  return Response.json(
    {
      error:
        status >= 500
          ? "Internal server error"
          : errorMessage(err, "Request failed"),
    },
    { status },
  );
}

export function requestBaseUrl(request: Request): string {
  const url = new URL(request.url);
  const proto =
    request.headers.get("x-forwarded-proto") ??
    url.protocol.replace(":", "");
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    url.host;
  return `${proto}://${host}`;
}

/** Alias used by Clerk UI routes. */
export function requestOrigin(request: Request): string {
  return requestBaseUrl(request);
}

export function errorStatus(err: unknown, fallback = 500): number {
  if (
    err &&
    typeof err === "object" &&
    "status" in err &&
    typeof (err as { status: unknown }).status === "number"
  ) {
    return (err as { status: number }).status;
  }
  return fallback;
}

export function errorMessage(err: unknown, fallback = "Request failed"): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function jsonError(err: unknown, fallbackMessage = "Request failed") {
  const status = errorStatus(err);
  if (status >= 500) {
    console.error("[http] unexpected human API error", err);
  }
  return Response.json(
    {
      error:
        status >= 500 ? "Internal server error" : errorMessage(err, fallbackMessage),
    },
    { status },
  );
}
