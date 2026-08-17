import {
  getAuthorizationServerMetadata,
  jsonCors,
  optionsCors,
} from "@/lib/mcp-oauth";
import { requestBaseUrl } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return optionsCors();
}

export async function GET(request: Request) {
  const base = requestBaseUrl(request).replace(/\/$/, "");
  return jsonCors(getAuthorizationServerMetadata(base), 200, {
    "Cache-Control": "public, max-age=300",
  });
}
