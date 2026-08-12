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
  const status = message.includes("DATABASE_URL") ? 503 : 500;
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
