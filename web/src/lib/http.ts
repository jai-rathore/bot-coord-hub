import { AgentApiError } from "@/lib/agent-api";

export async function readJsonBody<T extends Record<string, unknown>>(
  request: Request,
): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new AgentApiError(400, "Invalid JSON body");
  }
}

export function jsonOk(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export function jsonFromAgentError(err: unknown) {
  if (err instanceof AgentApiError) {
    return Response.json(
      { error: err.message, ...(err.details ?? {}) },
      { status: err.status },
    );
  }
  const message = err instanceof Error ? err.message : "Server error";
  const status =
    errorStatus(err, message.includes("DATABASE_URL") ? 503 : 500);
  return Response.json({ error: message }, { status });
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
  return Response.json(
    { error: errorMessage(err, fallbackMessage) },
    { status: errorStatus(err) },
  );
}
