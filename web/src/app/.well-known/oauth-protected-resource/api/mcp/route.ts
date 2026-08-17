import {
  getProtectedResourceMetadata,
  jsonCors,
  optionsCors,
} from "@/lib/mcp-oauth";
import { requestBaseUrl } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return optionsCors();
}

/** RFC 9728 path-appended metadata for resource https://host/api/mcp */
export async function GET(request: Request) {
  const base = requestBaseUrl(request).replace(/\/$/, "");
  return jsonCors(getProtectedResourceMetadata(base), 200, {
    "Cache-Control": "public, max-age=300",
  });
}
