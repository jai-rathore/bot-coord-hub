import { getDiscoveryDocument, PRODUCT_VERSION } from "@/lib/discovery";
import { requestBaseUrl } from "@/lib/http";

export const dynamic = "force-dynamic";

/** OpenAPI-ish agent API description. */
export async function GET(request: Request) {
  const base = requestBaseUrl(request);
  const discovery = getDiscoveryDocument(base);

  const paths: Record<string, Record<string, unknown>> = {};
  for (const [name, ep] of Object.entries(discovery.endpoints)) {
    const path = ep.path.replace(":id", "{id}");
    const method = ep.method.toLowerCase();
    paths[path] ??= {};
    const publicOp = name === "health" || name === "triage_intents";
    paths[path][method] = {
      operationId: name,
      summary: name,
      security: publicOp
        ? name === "triage_intents"
          ? [{ triageSecret: [] }]
          : []
        : [{ bearerAuth: [] }],
      responses: {
        "200": { description: "OK" },
        "401": { description: "Unauthorized" },
        "429": { description: "Rate limited" },
      },
    };
  }

  return Response.json({
    openapi: "3.1.0",
    info: {
      title: "HoneyMatcha Agent API",
      version: PRODUCT_VERSION,
      description:
        "Bearer API key (hm_...) agent surface. See /docs and MCP at /api/mcp.",
    },
    servers: [{ url: base }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "API key from /app/keys (prefix hm_)",
        },
        triageSecret: {
          type: "apiKey",
          in: "header",
          name: "X-Triage-Secret",
          description: "Shared TRIAGE_SECRET for the intent triage worker",
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths,
    "x-honeymatcha": discovery,
  });
}
