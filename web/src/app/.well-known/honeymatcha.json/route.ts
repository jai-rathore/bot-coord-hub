import { getDiscoveryDocument } from "@/lib/discovery";
import { requestBaseUrl } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Machine-readable discovery for agents. */
export async function GET(request: Request) {
  return Response.json(getDiscoveryDocument(requestBaseUrl(request)), {
    headers: {
      "Cache-Control": "public, max-age=60",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
