import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import {
  DEFAULT_REDIRECT_ALLOWLIST,
  getAuthorizationServerMetadata,
  getProtectedResourceMetadata,
  isAllowedRedirectUri,
  MCP_OAUTH_SCOPES,
  mcpProtectedResourceMetadataUrl,
  verifyPkceS256,
} from "./mcp-oauth";
import { PAIRING_AGENT_SCOPES } from "./scopes";

test("MCP OAuth scopes never include approvals:write", () => {
  assert.equal(MCP_OAUTH_SCOPES.includes("approvals:write"), false);
  assert.deepEqual(MCP_OAUTH_SCOPES, PAIRING_AGENT_SCOPES);
});

test("redirect allowlist accepts Cursor cloud, desktop loopback, and cursor:// fallback", () => {
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
