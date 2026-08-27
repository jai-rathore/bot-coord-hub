import assert from "node:assert/strict";
import test from "node:test";
import { AgentApiError } from "./agent-errors";
import { HIRING_CURRENCY_CODES, HIRING_WORK_MODES } from "./hiring-options";
import { MCP_TOOLS, mcpToolError } from "./mcp-tools";

test("every MCP tool publishes ChatGPT and Claude safety metadata", () => {
  assert.ok(MCP_TOOLS.length > 0);
  for (const tool of MCP_TOOLS) {
    assert.ok(tool.title, `${tool.name} is missing a title`);
    assert.deepEqual(tool.outputSchema, {
      type: "object",
      additionalProperties: true,
    });
    assert.equal(tool.securitySchemes[0]?.type, "oauth2");
    assert.ok(
      tool.securitySchemes[0]?.scopes.length,
      `${tool.name} is missing OAuth scopes`,
    );
    assert.equal(typeof tool.annotations.readOnlyHint, "boolean");
    assert.equal(typeof tool.annotations.openWorldHint, "boolean");
    assert.equal(typeof tool.annotations.destructiveHint, "boolean");
    if (tool.annotations.readOnlyHint) {
      assert.equal(
        tool.annotations.destructiveHint,
        false,
        `${tool.name} cannot be both read-only and destructive`,
      );
    }
  }
});

test("representative MCP actions have conservative safety annotations", () => {
  const byName = new Map(MCP_TOOLS.map((tool) => [tool.name, tool]));
  assert.equal(byName.get("get_inbox")?.annotations.readOnlyHint, true);
  assert.equal(byName.get("list_events")?.annotations.readOnlyHint, true);
  assert.deepEqual(byName.get("request_schedule_meeting")?.annotations, {
    readOnlyHint: false,
    openWorldHint: true,
    destructiveHint: true,
  });
  assert.deepEqual(byName.get("revoke_link")?.annotations, {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: true,
  });
});

test("recruiting MCP tools publish the same hiring contract as the UI", () => {
  const byName = new Map(MCP_TOOLS.map((tool) => [tool.name, tool]));
  const draft = byName.get("draft_hiring_role");
  assert.ok(draft, "draft_hiring_role must be in the MCP catalog");
  assert.deepEqual(draft?.annotations, {
    readOnlyHint: false,
    openWorldHint: true,
    destructiveHint: false,
  });

  const privateConfig = byName.get("propose_hiring_role")?.inputSchema.properties
    .privateConfig as { properties?: Record<string, { enum?: string[] }> };
  assert.deepEqual(
    privateConfig.properties?.compensationCurrency?.enum,
    [...HIRING_CURRENCY_CODES],
  );
  assert.deepEqual(
    (
      privateConfig.properties?.workModes as {
        items?: { enum?: string[] };
      }
    ).items?.enum,
    [...HIRING_WORK_MODES],
  );

  const guestPrivate = byName.get("create_guest_task")?.inputSchema.properties
    .privateConfig as { properties?: Record<string, unknown> };
  assert.ok(guestPrivate.properties?.compensationCurrency);
  assert.ok(
    byName
      .get("respond_to_hiring_request")
      ?.inputSchema.properties.response,
  );
});

test("insufficient scope tool errors carry ChatGPT's OAuth challenge metadata", () => {
  const result = mcpToolError(
    new AgentApiError(403, "Agent connection requires scope: events:read", {
      code: "insufficient_scope",
    }),
    "https://honeymatcha.io",
  );
  assert.deepEqual(result._meta?.["mcp/www_authenticate"], [
    'Bearer resource_metadata="https://honeymatcha.io/.well-known/oauth-protected-resource/api/mcp", error="insufficient_scope", error_description="Agent connection requires scope: events:read"',
  ]);
});
