import { agentLlmsText } from "@/lib/connect-copy";
import { requestBaseUrl } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return new Response(agentLlmsText(requestBaseUrl(request)), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
