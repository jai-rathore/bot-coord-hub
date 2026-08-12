import { getDiscoveryDocument, PRODUCT_VERSION } from "@/lib/discovery";
import { requestBaseUrl } from "@/lib/http";

export const dynamic = "force-dynamic";

/** OpenAPI-ish agent API description. */
export async function GET(request: Request) {
  const base = requestBaseUrl(request);
  const discovery = getDiscoveryDocument(base);

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
      },
    },
    security: [{ bearerAuth: [] }],
    paths: Object.fromEntries(
      Object.entries(discovery.endpoints).map(([name, ep]) => {
        const path = ep.path.replace(":id", "{id}");
        const method = ep.method.toLowerCase();
        return [
          path,
          {
            [method]: {
              operationId: name,
              summary: name,
              security: name === "health" ? [] : [{ bearerAuth: [] }],
              responses: {
                "200": { description: "OK" },
                "401": { description: "Unauthorized" },
              },
            },
          },
        ];
      }),
    ),
    "x-honeymatcha": discovery,
  });
}
