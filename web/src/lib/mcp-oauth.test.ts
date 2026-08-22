import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import {
  AGENT_SCOPE_COPY,
  DEFAULT_REDIRECT_ALLOWLIST,
  assertMcpResource,
  buildAuthorizeRedirect,
  getAuthorizationServerMetadata,
  getProtectedResourceMetadata,
  isAllowedRedirectUri,
  isAllowedMcpOrigin,
  MCP_OAUTH_SCOPES,
  mcpProtectedResourceMetadataUrl,
  mcpResourceIdentifier,
  parseAuthorizeRequest,
  verifyPkceS256,
} from "./mcp-oauth";
import { PAIRING_AGENT_SCOPES } from "./scopes";

test("MCP OAuth scopes never include approvals:write", () => {
  assert.equal(MCP_OAUTH_SCOPES.includes("approvals:write"), false);
  assert.deepEqual(MCP_OAUTH_SCOPES, PAIRING_AGENT_SCOPES);
  for (const scope of MCP_OAUTH_SCOPES) {
    assert.ok(AGENT_SCOPE_COPY[scope], `Consent copy is missing for ${scope}`);
  }
});

test("redirect allowlist accepts hosted assistants, Cursor cloud, and desktop callbacks", () => {
  assert.equal(
    isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback"),
    true,
  );
  assert.equal(
    isAllowedRedirectUri(
      "https://chatgpt.com/connector_platform_oauth_redirect",
    ),
    true,
  );
  assert.equal(
    isAllowedRedirectUri("https://gemini.google.com/oauth-redirect"),
    true,
  );
  assert.equal(
    isAllowedRedirectUri("https://www.cursor.com/agents/mcp/oauth/callback"),
    true,
  );
  assert.equal(
    isAllowedRedirectUri("https://cursor.com/agents/mcp/oauth/callback"),
    true,
  );
  assert.equal(isAllowedRedirectUri("http://localhost:8787/callback"), true);
  assert.equal(isAllowedRedirectUri("http://127.0.0.1:8787/callback"), true);
  assert.equal(isAllowedRedirectUri("http://[::1]:8787/callback"), true);
  assert.equal(isAllowedRedirectUri("http://127.0.0.1:9999/callback"), true);
  assert.equal(
    isAllowedRedirectUri("cursor://anysphere.cursor-mcp/oauth/callback"),
    true,
  );
  assert.equal(isAllowedRedirectUri("https://evil.example/callback"), false);
  assert.equal(
    isAllowedRedirectUri("https://gemini.google.com.evil.example/oauth-redirect"),
    false,
  );
  assert.equal(isAllowedRedirectUri("http://localhost:8787/other"), false);
  assert.ok(DEFAULT_REDIRECT_ALLOWLIST.length >= 2);
});

test("PKCE S256 verification matches RFC 7636", () => {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  assert.equal(verifyPkceS256(verifier, challenge), true);
  assert.equal(verifyPkceS256(verifier, "not-the-challenge"), false);
  assert.equal(verifyPkceS256("wrong-verifier", challenge), false);
  assert.equal(verifyPkceS256("short", challenge), false);
});

test("MCP Origin validation allows supported hosts and blocks DNS rebinding", () => {
  const issuer = "https://honeymatcha.io";
  assert.equal(isAllowedMcpOrigin(null, issuer), true);
  assert.equal(isAllowedMcpOrigin(issuer, issuer), true);
  assert.equal(isAllowedMcpOrigin("https://chatgpt.com", issuer), true);
  assert.equal(isAllowedMcpOrigin("https://claude.ai", issuer), true);
  assert.equal(isAllowedMcpOrigin("https://gemini.google.com", issuer), true);
  assert.equal(isAllowedMcpOrigin("https://evil.example", issuer), false);
  assert.equal(isAllowedMcpOrigin("null", issuer), false);
  assert.equal(
    isAllowedMcpOrigin("http://localhost:6274", "http://localhost:3000"),
    true,
  );
  assert.equal(
    isAllowedMcpOrigin("http://localhost:6274", issuer),
    false,
  );
});

test("authorization server and protected resource metadata point at OAuth routes", () => {
  const issuer = "https://honeymatcha.io";
  const as = getAuthorizationServerMetadata(issuer);
  assert.equal(as.issuer, issuer);
  assert.equal(as.authorization_endpoint, `${issuer}/oauth/authorize`);
  assert.equal(as.token_endpoint, `${issuer}/oauth/token`);
  assert.equal(as.registration_endpoint, `${issuer}/oauth/register`);
  assert.deepEqual(as.code_challenge_methods_supported, ["S256"]);
  assert.ok(as.grant_types_supported.includes("authorization_code"));
  assert.ok(as.grant_types_supported.includes("refresh_token"));
  assert.equal(as.authorization_response_iss_parameter_supported, true);
  assert.equal(as.resource_indicators_supported, true);

  const pr = getProtectedResourceMetadata(issuer);
  assert.equal(pr.resource, `${issuer}/api/mcp`);
  assert.deepEqual(pr.authorization_servers, [issuer]);
  assert.ok(pr.scopes_supported.includes("tasks:write"));
  assert.equal(pr.scopes_supported.includes("approvals:write"), false);
  assert.equal(
    mcpProtectedResourceMetadataUrl(issuer),
    `${issuer}/.well-known/oauth-protected-resource/api/mcp`,
  );
});

test("OAuth resource indicators are bound to the HoneyMatcha MCP endpoint", () => {
  const issuer = "https://honeymatcha.io";
  const resource = `${issuer}/api/mcp`;
  assert.equal(mcpResourceIdentifier(`${issuer}/`), resource);
  assert.equal(assertMcpResource(resource, issuer), resource);
  assert.equal(assertMcpResource(null, issuer), resource);
  assert.throws(
    () => assertMcpResource(`${issuer}/api/v1/me`, issuer),
    /Unsupported OAuth resource/,
  );
});

test("authorization requests preserve RFC 8707 resource and responses identify issuer", () => {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL("https://honeymatcha.io/oauth/authorize");
  url.searchParams.set("client_id", "hmc_test");
  url.searchParams.set(
    "redirect_uri",
    "https://chatgpt.com/connector_platform_oauth_redirect",
  );
  url.searchParams.set("response_type", "code");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("resource", "https://honeymatcha.io/api/mcp");
  const parsed = parseAuthorizeRequest(url);
  assert.equal(parsed.resource, "https://honeymatcha.io/api/mcp");
  assert.equal(parsed.agentName, "Personal assistant");

  const redirect = new URL(
    buildAuthorizeRedirect(parsed.redirectUri, {
      code: "hac_test",
      state: "state-test",
      iss: "https://honeymatcha.io",
    }),
  );
  assert.equal(redirect.searchParams.get("iss"), "https://honeymatcha.io");
  assert.equal(redirect.searchParams.get("code"), "hac_test");
});
