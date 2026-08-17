import { AgentApiError } from "@/lib/agent-errors";
import { jsonFromAgentError } from "@/lib/http";
import {
  exchangeAuthorizationCode,
  jsonCors,
  optionsCors,
  oauthError,
  withCors,
} from "@/lib/mcp-oauth";
import {
  pairingRateLimitKey,
  rateLimit,
  rateLimitedJson,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return optionsCors();
}

export async function POST(request: Request) {
  const rate = rateLimit(pairingRateLimitKey(request), 30);
  if (!rate.ok) return withCors(rateLimitedJson(rate));

  try {
    const contentType = request.headers.get("content-type") ?? "";
    let grantType = "";
    let code: string | null = null;
    let redirectUri: string | null = null;
    let clientId: string | null = null;
    let codeVerifier: string | null = null;
    let refreshToken: string | null = null;

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const form = await request.formData();
      grantType = String(form.get("grant_type") ?? "");
      code = form.get("code") ? String(form.get("code")) : null;
      redirectUri = form.get("redirect_uri")
        ? String(form.get("redirect_uri"))
        : null;
      clientId = form.get("client_id") ? String(form.get("client_id")) : null;
      codeVerifier = form.get("code_verifier")
        ? String(form.get("code_verifier"))
        : null;
      refreshToken = form.get("refresh_token")
        ? String(form.get("refresh_token"))
        : null;
    } else {
      const body = (await request.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      grantType = String(body.grant_type ?? "");
      code = typeof body.code === "string" ? body.code : null;
      redirectUri =
        typeof body.redirect_uri === "string" ? body.redirect_uri : null;
      clientId = typeof body.client_id === "string" ? body.client_id : null;
      codeVerifier =
        typeof body.code_verifier === "string" ? body.code_verifier : null;
      refreshToken =
        typeof body.refresh_token === "string" ? body.refresh_token : null;
    }

    const token = await exchangeAuthorizationCode({
      grantType,
      code,
      redirectUri,
      clientId,
      codeVerifier,
      refreshToken,
    });
    return jsonCors(token);
  } catch (error) {
    if (error instanceof AgentApiError) {
      const code =
        typeof error.details?.code === "string"
          ? error.details.code
          : "invalid_request";
      return oauthError(error.status, code, error.message);
    }
    return withCors(jsonFromAgentError(error));
  }
}
