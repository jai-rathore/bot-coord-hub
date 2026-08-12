import { requestBaseUrl } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const base = requestBaseUrl(request).replace(/\/$/, "");
  return Response.json(
    {
      resource: `${base}/api/mcp`,
      authorization_servers: [],
      scopes_supported: [
        "profile:read",
        "people:read",
        "people:write",
        "tasks:read",
        "tasks:write",
        "approvals:read",
        "guest_tasks:read",
        "guest_tasks:write",
        "intents:read",
        "intents:request",
      ],
      bearer_methods_supported: ["header"],
      resource_documentation: `${base}/docs`,
      "x-honeymatcha-pairing": {
        start: `${base}/api/v1/pairings/start`,
        token: `${base}/api/v1/pairings/token`,
        fallback: "Scoped hm_ bearer credential",
      },
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
      },
    },
  );
}
