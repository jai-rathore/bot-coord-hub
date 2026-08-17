/**
 * MCP OAuth 2.1 authorization server helpers for Grok Bot / Cursor remote MCP.
 * Public clients use Dynamic Client Registration + authorization_code + PKCE S256.
 * Access tokens are scoped hm_ API keys (same as device-code pairing).
 */

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import {
  apiKeys,
  oauthAuthorizationCodes,
  oauthClients,
  oauthRefreshTokens,
  type User,
} from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { AgentApiError } from "@/lib/agent-errors";
import { generateApiKey } from "@/lib/keys";
import {
  normalizeAgentScopes,
  PAIRING_AGENT_SCOPES,
  type AgentScope,
} from "@/lib/scopes";
import { boundedText } from "@/lib/validation";

export const AUTH_CODE_TTL_MS = 10 * 60 * 1_000;
export const ACCESS_TOKEN_TTL_SEC = 30 * 24 * 60 * 60;
export const REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1_000;

export const MCP_OAUTH_SCOPES = PAIRING_AGENT_SCOPES;

export const DEFAULT_REDIRECT_ALLOWLIST = [
  "https://www.cursor.com/agents/mcp/oauth/callback",
  "https://cursor.com/agents/mcp/oauth/callback",
  "http://localhost:8787/callback",
  "http://127.0.0.1:8787/callback",
  "http://[::1]:8787/callback",
  "cursor://anysphere.cursor-mcp/oauth/callback",
] as const;

const CURSOR_CUSTOM_SCHEME_CALLBACKS = [
  "cursor://anysphere.cursor-mcp/oauth/callback",
] as const;

function isLoopbackOAuthCallback(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.protocol !== "http:") return false;
  const host = url.hostname.toLowerCase();
  if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") {
    return false;
  }
  if (url.username || url.password) return false;
  const path = url.pathname.replace(/\/+$/, "") || "/";
  return path === "/callback";
}

export const AGENT_SCOPE_COPY: Record<string, string> = {
  "profile:read": "Know which HoneyMatcha account it represents",
  "people:read": "See people you have connected",
  "people:write": "Invite or remove people for you",
  "tasks:read": "Read your coordination tasks",
  "tasks:write": "Start tasks and handle the back-and-forth",
  "approvals:read": "Tell you when something needs your attention",
  "guest_tasks:read": "Read answers to private guest requests",
  "guest_tasks:write": "Create private requests for people without accounts",
  "intents:read": "See supported task types",
  "intents:request": "Suggest a new task type",
  "discovery:read": "See purpose-bound discovery capabilities",
  "discovery:write": "Enroll and search for purpose-matched people",
};

export function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, Mcp-Session-Id, MCP-Protocol-Version",
    "Access-Control-Expose-Headers": "Mcp-Session-Id, WWW-Authenticate",
    "Access-Control-Max-Age": "86400",
  };
}

export function jsonCors(data: unknown, status = 200, extra?: HeadersInit) {
  return Response.json(data, {
    status,
    headers: { ...corsHeaders(), ...(extra ?? {}) },
  });
}

export function optionsCors() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders())) {
    if (!headers.has(key)) headers.set(key, value);
  }
  return new Response(response.body, { status: response.status, headers });
}

export function redirectAllowlist(): string[] {
  const extra = (process.env.MCP_OAUTH_REDIRECT_URIS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set([...DEFAULT_REDIRECT_ALLOWLIST, ...extra])];
}

export function isAllowedRedirectUri(uri: string): boolean {
  if (redirectAllowlist().includes(uri)) return true;
  if (
    CURSOR_CUSTOM_SCHEME_CALLBACKS.some(
      (callback) => uri === callback || uri.startsWith(`${callback}?`),
    )
  ) {
    return true;
  }
  return isLoopbackOAuthCallback(uri);
}

export function mcpProtectedResourceMetadataUrl(issuer: string): string {
  const base = issuer.replace(/\/$/, "");
  return `${base}/.well-known/oauth-protected-resource/api/mcp`;
}

/** RFC 9728 + MCP-style Bearer challenge. Path-appended metadata matches Linear/Sentry. */
export function mcpUnauthorized(issuer: string): Response {
  const metadata = mcpProtectedResourceMetadataUrl(issuer);
  const description = "Missing or invalid access token";
  return jsonCors(
    { error: "invalid_token", error_description: description },
    401,
    {
      "Cache-Control": "no-store",
      "WWW-Authenticate": `Bearer realm="OAuth", resource_metadata="${metadata}", error="invalid_token", error_description="${description}"`,
    },
  );
}

export function mcpMethodNotAllowed(allow = "POST, OPTIONS"): Response {
  return new Response(null, {
    status: 405,
    headers: {
      ...corsHeaders(),
      Allow: allow,
    },
  });
}

export function hashOAuthSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function verifyPkceS256(codeVerifier: string, codeChallenge: string): boolean {
  if (codeVerifier.length < 43 || codeVerifier.length > 128) return false;
  const digest = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  const a = Buffer.from(digest);
  const b = Buffer.from(codeChallenge);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function getAuthorizationServerMetadata(issuer: string) {
  const base = issuer.replace(/\/$/, "");
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [...MCP_OAUTH_SCOPES],
    service_documentation: `${base}/docs`,
  };
}

export function getProtectedResourceMetadata(issuer: string) {
  const base = issuer.replace(/\/$/, "");
  return {
    resource: `${base}/api/mcp`,
    authorization_servers: [base],
    scopes_supported: [...MCP_OAUTH_SCOPES],
    bearer_methods_supported: ["header"],
    resource_documentation: `${base}/docs`,
    "x-honeymatcha-pairing": {
      start: `${base}/api/v1/pairings/start`,
      token: `${base}/api/v1/pairings/token`,
      fallback: "Scoped hm_ bearer credential",
    },
  };
}

export async function registerOAuthClient(input: {
  clientName?: unknown;
  redirectUris?: unknown;
  tokenEndpointAuthMethod?: unknown;
}) {
  const requested = Array.isArray(input.redirectUris)
    ? input.redirectUris.filter((uri): uri is string => typeof uri === "string")
    : [];
  if (!requested.length) {
    throw new AgentApiError(400, "redirect_uris is required");
  }
  const redirectUris = [...new Set(requested.filter(isAllowedRedirectUri))];
  if (!redirectUris.length) {
    throw new AgentApiError(400, `redirect_uri is not allowed: ${requested[0]}`, {
      code: "invalid_redirect_uri",
      allowed: redirectAllowlist(),
    });
  }

  const clientName =
    boundedText(input.clientName, "client_name", 120) ?? "MCP Client";
  const authMethod =
    typeof input.tokenEndpointAuthMethod === "string"
      ? input.tokenEndpointAuthMethod
      : "none";
  if (authMethod !== "none") {
    throw new AgentApiError(
      400,
      "Only public clients (token_endpoint_auth_method=none) are supported",
    );
  }

  const clientId = `hmc_${randomBytes(16).toString("base64url")}`;
  const [created] = await getDb()
    .insert(oauthClients)
    .values({
      clientId,
      clientName,
      redirectUris,
      tokenEndpointAuthMethod: "none",
    })
    .returning();

  await writeAudit({
    actorKind: "system",
    action: "oauth.client_registered",
    entityType: "oauth_client",
    entityId: created.id,
    metadata: { clientId, clientName, redirectUris },
  });

  return {
    client_id: created.clientId,
    client_name: created.clientName,
    client_id_issued_at: Math.floor(created.createdAt.getTime() / 1000),
    redirect_uris: created.redirectUris,
    token_endpoint_auth_method: created.tokenEndpointAuthMethod,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    code_challenge_methods: ["S256"],
  };
}

export type AuthorizeRequest = {
  clientId: string;
  redirectUri: string;
  responseType: string;
  state: string | null;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string | null;
  agentName: string;
};

export function parseAuthorizeRequest(url: URL): AuthorizeRequest {
  const clientId = url.searchParams.get("client_id")?.trim() ?? "";
  const redirectUri = url.searchParams.get("redirect_uri")?.trim() ?? "";
  const responseType = url.searchParams.get("response_type")?.trim() ?? "";
  const state = url.searchParams.get("state");
  const codeChallenge = url.searchParams.get("code_challenge")?.trim() ?? "";
  const codeChallengeMethod =
    url.searchParams.get("code_challenge_method")?.trim() ?? "S256";
  const scope = url.searchParams.get("scope");
  const agentName =
    url.searchParams.get("client_name")?.trim() ||
    url.searchParams.get("agent_name")?.trim() ||
    "Grok Bot";

  if (!clientId) throw new AgentApiError(400, "client_id is required");
  if (!redirectUri) throw new AgentApiError(400, "redirect_uri is required");
  if (responseType !== "code") {
    throw new AgentApiError(400, "response_type must be code");
  }
  if (!codeChallenge) {
    throw new AgentApiError(400, "code_challenge is required");
  }
  if (codeChallengeMethod !== "S256") {
    throw new AgentApiError(400, "code_challenge_method must be S256");
  }
  if (!isAllowedRedirectUri(redirectUri)) {
    throw new AgentApiError(400, "redirect_uri is not allowed");
  }

  return {
    clientId,
    redirectUri,
    responseType,
    state,
    codeChallenge,
    codeChallengeMethod,
    scope,
    agentName: agentName.slice(0, 80),
  };
}

export async function loadOAuthClient(clientId: string) {
  const [client] = await getDb()
    .select()
    .from(oauthClients)
    .where(eq(oauthClients.clientId, clientId))
    .limit(1);
  return client ?? null;
}

export function scopesFromAuthorizeRequest(scope: string | null): AgentScope[] {
  if (!scope?.trim()) return [...MCP_OAUTH_SCOPES];
  return normalizeAgentScopes(scope.split(/[\s+]+/), MCP_OAUTH_SCOPES);
}

export async function createAuthorizationCode(opts: {
  user: User;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: AgentScope[];
  agentName: string;
}) {
  const client = await loadOAuthClient(opts.clientId);
  if (!client) throw new AgentApiError(400, "Unknown client_id");
  if (!client.redirectUris.includes(opts.redirectUri)) {
    throw new AgentApiError(400, "redirect_uri was not registered for this client");
  }

  const code = `hac_${randomBytes(24).toString("base64url")}`;
  const [row] = await getDb()
    .insert(oauthAuthorizationCodes)
    .values({
      codeHash: hashOAuthSecret(code),
      clientId: opts.clientId,
      userId: opts.user.id,
      redirectUri: opts.redirectUri,
      codeChallenge: opts.codeChallenge,
      codeChallengeMethod: "S256",
      scopes: opts.scopes,
      agentName: opts.agentName,
      expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
    })
    .returning();

  await writeAudit({
    actorUserId: opts.user.id,
    actorKind: "user",
    action: "oauth.authorized",
    entityType: "oauth_authorization_code",
    entityId: row.id,
    metadata: {
      clientId: opts.clientId,
      agentName: opts.agentName,
      scopes: opts.scopes,
    },
  });

  return code;
}

function oauthError(
  status: number,
  error: string,
  description: string,
): Response {
  return jsonCors(
    { error, error_description: description },
    status,
  );
}

export async function exchangeAuthorizationCode(input: {
  grantType: string;
  code?: string | null;
  redirectUri?: string | null;
  clientId?: string | null;
  codeVerifier?: string | null;
  refreshToken?: string | null;
}) {
  if (input.grantType === "refresh_token") {
    return refreshAccessToken({
      refreshToken: input.refreshToken,
      clientId: input.clientId,
    });
  }
  if (input.grantType !== "authorization_code") {
    throw new AgentApiError(400, "unsupported_grant_type", {
      code: "unsupported_grant_type",
    });
  }

  const code = input.code?.trim() ?? "";
  const redirectUri = input.redirectUri?.trim() ?? "";
  const clientId = input.clientId?.trim() ?? "";
  const codeVerifier = input.codeVerifier?.trim() ?? "";
  if (!code || !redirectUri || !clientId || !codeVerifier) {
    throw new AgentApiError(400, "invalid_request", {
      code: "invalid_request",
    });
  }

  const db = getDb();
  const [row] = await db
    .select()
    .from(oauthAuthorizationCodes)
    .where(eq(oauthAuthorizationCodes.codeHash, hashOAuthSecret(code)))
    .limit(1);
  if (!row || row.consumedAt) {
    throw new AgentApiError(400, "invalid_grant", { code: "invalid_grant" });
  }
  if (row.expiresAt <= new Date()) {
    throw new AgentApiError(400, "invalid_grant", { code: "invalid_grant" });
  }
  if (row.clientId !== clientId || row.redirectUri !== redirectUri) {
    throw new AgentApiError(400, "invalid_grant", { code: "invalid_grant" });
  }
  if (!verifyPkceS256(codeVerifier, row.codeChallenge)) {
    throw new AgentApiError(400, "invalid_grant", { code: "invalid_grant" });
  }

  const client = await loadOAuthClient(clientId);
  if (!client) {
    throw new AgentApiError(400, "invalid_client", { code: "invalid_client" });
  }

  const { rawKey, keyHash, keyPrefix } = generateApiKey();
  const refreshRaw = `hmr_${randomBytes(24).toString("base64url")}`;
  const scopes = normalizeAgentScopes(row.scopes, MCP_OAUTH_SCOPES);

  const result = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(oauthAuthorizationCodes)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(oauthAuthorizationCodes.id, row.id),
          isNull(oauthAuthorizationCodes.consumedAt),
        ),
      )
      .returning();
    if (!claimed) {
      throw new AgentApiError(400, "invalid_grant", { code: "invalid_grant" });
    }

    const [key] = await tx
      .insert(apiKeys)
      .values({
        userId: row.userId,
        name: row.agentName || client.clientName || "MCP Agent",
        keyHash,
        keyPrefix,
        scopes,
        expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_SEC * 1000),
      })
      .returning();

    await tx.insert(oauthRefreshTokens).values({
      tokenHash: hashOAuthSecret(refreshRaw),
      clientId,
      apiKeyId: key.id,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    });

    return key;
  });

  await writeAudit({
    actorUserId: row.userId,
    actorApiKeyId: result.id,
    actorKind: "system",
    action: "oauth.token_issued",
    entityType: "api_key",
    entityId: result.id,
    metadata: { clientId, grant: "authorization_code", scopes },
  });

  return {
    access_token: rawKey,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SEC,
    refresh_token: refreshRaw,
    scope: scopes.join(" "),
  };
}

async function refreshAccessToken(input: {
  refreshToken?: string | null;
  clientId?: string | null;
}) {
  const refreshToken = input.refreshToken?.trim() ?? "";
  const clientId = input.clientId?.trim() ?? "";
  if (!refreshToken || !clientId) {
    throw new AgentApiError(400, "invalid_request", { code: "invalid_request" });
  }

  const db = getDb();
  const [row] = await db
    .select()
    .from(oauthRefreshTokens)
    .where(eq(oauthRefreshTokens.tokenHash, hashOAuthSecret(refreshToken)))
    .limit(1);
  if (!row || row.revokedAt || row.expiresAt <= new Date()) {
    throw new AgentApiError(400, "invalid_grant", { code: "invalid_grant" });
  }
  if (row.clientId !== clientId) {
    throw new AgentApiError(400, "invalid_grant", { code: "invalid_grant" });
  }

  const [existingKey] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.id, row.apiKeyId))
    .limit(1);
  if (!existingKey || existingKey.revokedAt) {
    throw new AgentApiError(400, "invalid_grant", { code: "invalid_grant" });
  }

  const { rawKey, keyHash, keyPrefix } = generateApiKey();
  const refreshRaw = `hmr_${randomBytes(24).toString("base64url")}`;
  const scopes = normalizeAgentScopes(existingKey.scopes, MCP_OAUTH_SCOPES);

  const claimed = await db.transaction(async (tx) => {
    const [consumed] = await tx
      .update(oauthRefreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(oauthRefreshTokens.id, row.id),
          isNull(oauthRefreshTokens.revokedAt),
        ),
      )
      .returning();
    if (!consumed) {
      throw new AgentApiError(400, "invalid_grant", { code: "invalid_grant" });
    }
    await tx
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(apiKeys.id, existingKey.id));

    const [key] = await tx
      .insert(apiKeys)
      .values({
        userId: existingKey.userId,
        name: existingKey.name,
        keyHash,
        keyPrefix,
        scopes,
        expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_SEC * 1000),
        callbackUrl: existingKey.callbackUrl,
      })
      .returning();

    await tx.insert(oauthRefreshTokens).values({
      tokenHash: hashOAuthSecret(refreshRaw),
      clientId,
      apiKeyId: key.id,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    });
    return key;
  });

  if (!claimed) {
    throw new AgentApiError(400, "invalid_grant", { code: "invalid_grant" });
  }

  await writeAudit({
    actorUserId: existingKey.userId,
    actorKind: "system",
    action: "oauth.token_issued",
    entityType: "api_key",
    metadata: { clientId, grant: "refresh_token", scopes },
  });

  return {
    access_token: rawKey,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SEC,
    refresh_token: refreshRaw,
    scope: scopes.join(" "),
  };
}

/** Build redirect URL for success or denial. */
export function buildAuthorizeRedirect(
  redirectUri: string,
  params: Record<string, string | null | undefined>,
): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") url.searchParams.set(key, value);
  }
  return url.toString();
}

export { oauthError };
