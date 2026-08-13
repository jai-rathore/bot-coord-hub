import { getAgentCard } from "@/lib/agent-card";
import { requestBaseUrl } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return Response.json(getAgentCard(requestBaseUrl(request)), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300",
    },
  });
}
