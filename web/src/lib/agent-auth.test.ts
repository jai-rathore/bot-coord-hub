import assert from "node:assert/strict";
import { test } from "node:test";
import { isApiKeyAudienceAllowed } from "./agent-auth";

test("legacy API keys without an OAuth audience remain valid across agent routes", () => {
  assert.equal(
    isApiKeyAudienceAllowed(
      null,
      new Request("https://honeymatcha.io/api/v1/me"),
    ),
    true,
  );
});

test("OAuth access tokens are restricted to the MCP resource they were issued for", () => {
  const audience = "https://honeymatcha.io/api/mcp";
  assert.equal(
    isApiKeyAudienceAllowed(
      audience,
      new Request("https://internal:3000/api/mcp", {
        headers: {
          "x-forwarded-host": "honeymatcha.io",
          "x-forwarded-proto": "https",
        },
      }),
    ),
    true,
  );
  assert.equal(
    isApiKeyAudienceAllowed(
      audience,
      new Request("https://honeymatcha.io/api/v1/me"),
    ),
    false,
  );
});
