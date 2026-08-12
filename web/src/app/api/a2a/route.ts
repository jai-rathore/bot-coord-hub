import { randomUUID } from "crypto";
import { dispatchMcpTool } from "@/lib/mcp-tools";
import { readBoard } from "@/lib/agent-api";
import { AgentApiError } from "@/lib/agent-errors";
import { requireAgent } from "@/lib/http";

export const dynamic = "force-dynamic";

type RpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

function rpcResult(id: RpcRequest["id"], result: unknown) {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, result });
}

function rpcError(
  id: RpcRequest["id"],
  code: number,
  message: string,
  data?: unknown,
) {
  return Response.json({
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  });
}

function taskState(status: string, phase?: unknown) {
  if (status === "confirmed" || phase === "confirmed") {
    return "TASK_STATE_COMPLETED";
  }
  if (status === "declined") return "TASK_STATE_REJECTED";
  if (status === "cancelled" || phase === "failed") {
    return "TASK_STATE_FAILED";
  }
  if (phase === "awaiting_confirm" || status === "accepted") {
    return "TASK_STATE_INPUT_REQUIRED";
  }
  if (status === "open") return "TASK_STATE_SUBMITTED";
  return "TASK_STATE_WORKING";
}

function resultTask(data: unknown, contextId: string) {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const sessionValue = record.session;
  if (!sessionValue || typeof sessionValue !== "object") return null;
  const session = sessionValue as Record<string, unknown>;
  const id = typeof session.id === "string" ? session.id : null;
  if (!id) return null;
  const payload =
    session.payload && typeof session.payload === "object"
      ? (session.payload as Record<string, unknown>)
      : {};
  return {
    id,
    contextId,
    status: {
      state: taskState(String(session.status ?? "open"), payload.phase),
      timestamp: new Date().toISOString(),
    },
    artifacts: [
      {
        artifactId: randomUUID(),
        name: "HoneyMatcha task result",
        parts: [{ data }],
      },
    ],
  };
}

export async function POST(request: Request) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;

  if (request.headers.get("a2a-version") !== "1.0") {
    return rpcError(null, -32600, "A2A-Version: 1.0 header is required");
  }

  let body: RpcRequest;
  try {
    body = (await request.json()) as RpcRequest;
  } catch {
    return rpcError(null, -32700, "Parse error");
  }

  try {
    if (body.method === "SendMessage") {
      const message = body.params?.message as
        | {
            messageId?: string;
            contextId?: string;
            parts?: Array<Record<string, unknown>>;
          }
        | undefined;
      const dataPart = message?.parts?.find(
        (part) => part && typeof part.data === "object",
      );
      const command = dataPart?.data as
        | { tool?: string; arguments?: Record<string, unknown> }
        | undefined;
      if (!command?.tool) {
        return rpcError(
          body.id,
          -32602,
          "SendMessage requires a data part: { tool, arguments }",
        );
      }
      const data = await dispatchMcpTool(
        auth,
        command.tool,
        command.arguments ?? {},
        request,
      );
      const contextId = message?.contextId ?? randomUUID();
      const task = resultTask(data, contextId);
      if (task) return rpcResult(body.id, { task });
      return rpcResult(body.id, {
        message: {
          messageId: randomUUID(),
          contextId,
          role: "ROLE_AGENT",
          parts: [{ data }],
        },
      });
    }

    if (body.method === "GetTask") {
      const taskId = body.params?.id;
      if (typeof taskId !== "string") {
        return rpcError(body.id, -32602, "GetTask requires params.id");
      }
      const board = await readBoard(auth, taskId);
      const session = board.session;
      const payload =
        session.payload && typeof session.payload === "object"
          ? (session.payload as Record<string, unknown>)
          : {};
      return rpcResult(body.id, {
        id: session.id,
        contextId: session.id,
        status: {
          state: taskState(session.status, payload.phase),
          timestamp: new Date().toISOString(),
        },
        artifacts: [
          {
            artifactId: randomUUID(),
            name: "Task activity",
            parts: [{ data: board }],
          },
        ],
      });
    }

    return rpcError(body.id, -32601, "Method not found");
  } catch (error) {
    if (error instanceof AgentApiError) {
      return rpcError(body.id, -32000, error.message, {
        status: error.status,
        ...error.details,
      });
    }
    return rpcError(
      body.id,
      -32603,
      error instanceof Error ? error.message : "Internal error",
    );
  }
}
