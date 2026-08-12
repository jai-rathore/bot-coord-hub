import { authenticateAgent, unauthorizedJson } from "@/lib/agent-auth";
import { PRODUCT_VERSION } from "@/lib/discovery";
import {
  dispatchMcpTool,
  MCP_TOOLS,
  mcpToolError,
  mcpToolResult,
} from "@/lib/mcp-tools";

export const dynamic = "force-dynamic";

type JsonRpcId = string | number | null;

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: Record<string, unknown>;
};

function rpcResult(id: JsonRpcId, result: unknown) {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, result });
}

function rpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
) {
  return Response.json({
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message, data },
  });
}

/**
 * Lightweight MCP JSON-RPC over HTTP for remote agents.
 *
 * POST /api/mcp
 * Authorization: Bearer hm_...
 *
 * Supported methods: initialize, tools/list, tools/call, ping
 * Also accepts { tool, arguments } shortcut for tools/call.
 */
export async function POST(request: Request) {
  const auth = await authenticateAgent(request);
  if (!auth) return unauthorizedJson();

  let body: JsonRpcRequest;
  try {
    body = (await request.json()) as JsonRpcRequest;
  } catch {
    return rpcError(null, -32700, "Parse error");
  }

  const id = body.id ?? null;

  // Shortcut: { tool: "whoami", arguments: {} }
  if (typeof (body as { tool?: string }).tool === "string") {
    const tool = (body as { tool: string }).tool;
    const args =
      ((body as { arguments?: Record<string, unknown> }).arguments as
        | Record<string, unknown>
        | undefined) ?? {};
    try {
      const data = await dispatchMcpTool(auth, tool, args, request);
      return Response.json({ ok: true, tool, result: data });
    } catch (err) {
      return Response.json(mcpToolError(err), { status: 400 });
    }
  }

  const method = body.method;
  if (!method) {
    return rpcError(id, -32600, "Invalid Request: method required");
  }

  try {
    switch (method) {
      case "initialize":
        return rpcResult(id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: {
            name: "honeymatcha",
            version: PRODUCT_VERSION,
          },
          instructions:
            "HoneyMatcha MCP. Authenticate with Bearer hm_... Create keys at /app/keys. Tools wrap /api/v1/*.",
        });
      case "notifications/initialized":
      case "initialized":
        return new Response(null, { status: 204 });
      case "ping":
        return rpcResult(id, {});
      case "tools/list":
        return rpcResult(id, { tools: MCP_TOOLS });
      case "tools/call": {
        const params = body.params ?? {};
        const name = String(params.name ?? "");
        const args = (params.arguments as Record<string, unknown>) ?? {};
        if (!name) {
          return rpcError(id, -32602, "tools/call requires params.name");
        }
        try {
          const data = await dispatchMcpTool(auth, name, args, request);
          return rpcResult(id, mcpToolResult(data));
        } catch (err) {
          return rpcResult(id, mcpToolError(err));
        }
      }
      default:
        return rpcError(id, -32601, `Method not found: ${method}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return rpcError(id, -32603, message);
  }
}

/** GET returns tool catalog (discovery helper). Auth required. */
export async function GET(request: Request) {
  const auth = await authenticateAgent(request);
  if (!auth) return unauthorizedJson();

  return Response.json({
    ok: true,
    server: "honeymatcha",
    version: PRODUCT_VERSION,
    protocolVersion: "2024-11-05",
    tools: MCP_TOOLS,
    usage: {
      jsonrpc: 'POST { "jsonrpc":"2.0","id":1,"method":"tools/list" }',
      call: 'POST { "jsonrpc":"2.0","id":2,"method":"tools/call","params":{ "name":"whoami","arguments":{} } }',
      shortcut: 'POST { "tool":"list_intents","arguments":{} }',
    },
  });
}
