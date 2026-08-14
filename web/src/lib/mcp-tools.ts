/**
 * MCP tool catalog + dispatcher for HoneyMatcha.
 * Used by POST /api/mcp (JSON-RPC) and documented for the stdio MCP entry.
 */

import { SCHEDULE_MEETING_TOOL_DESCRIPTION } from "@/lib/schedule-copy";
import type { AgentAuth } from "@/lib/agent-auth";
import { assertAgentScope } from "@/lib/scopes";
import {
  acceptInvite,
  ackInbox,
  AgentApiError,
  createGuestTask,
  createInvite,
  createPublicInvite,
  listConfirms,
  listGuestTasks,
  listInbox,
  listIntents,
  listLinks,
  listPublicInvites,
  listSessions,
  postBoardMessage,
  proposeIntent,
  readGuestTask,
  readBoard,
  requestScheduleMeeting,
  redeemPublicInvite,
  revokeGuestTask,
  revokePublicInvite,
  setAgentCallback,
  whoami,
} from "@/lib/agent-api";

export type McpToolDef = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
};

export const MCP_TOOLS: McpToolDef[] = [
  {
    name: "whoami",
    description:
      "Health check. Also returns inbox.pending. If pending > 0, call get_inbox immediately — another person's agent has work for you.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "get_inbox",
    description:
      "Call this at the start of every turn. HoneyMatcha reaches you by writing inbound work here when someone else's agent starts a task with your human. Handle each item, then ack_inbox.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "ack_inbox",
    description: "Mark an inbox item as handled after you have taken the next step.",
    inputSchema: {
      type: "object",
      properties: {
        inboxId: { type: "string" },
      },
      required: ["inboxId"],
    },
  },
  {
    name: "register_agent_callback",
    description:
      "Optional. Register an HTTPS URL HoneyMatcha will POST when you have new inbox work. Grok Bots generally cannot receive this; they should poll get_inbox instead.",
    inputSchema: {
      type: "object",
      properties: {
        callbackUrl: {
          type: "string",
          description: "HTTPS URL, or empty to clear",
        },
      },
    },
  },
  {
    name: "list_links",
    description:
      "List peer links (pending/active/revoked) for the authenticated user.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "create_invite",
    description:
      "Create a targeted, expiring relationship invitation for a known person. Recipient email is required.",
    inputSchema: {
      type: "object",
      properties: {
        toEmail: {
          type: "string",
          description: "Recipient email. Open network invitations are not supported.",
        },
        toName: { type: "string", description: "Optional peer display name" },
        scopes: {
          type: "array",
          items: { type: "string" },
          description:
            'Optional scopes (default: ["schedule_meeting","avail.read_freebusy"])',
        },
        confirmRequired: {
          type: "boolean",
          description: "Require human confirms before booking (default true)",
        },
        timezone: {
          type: "string",
          description: "IANA timezone for allowedHours evaluation",
        },
        allowedHours: {
          type: "object",
          description: '{ start: "09:00", end: "17:00", days?: number[] }',
          additionalProperties: true,
        },
      },
      required: ["toEmail"],
    },
  },
  {
    name: "accept_invite",
    description: "Accept a peer invite by inviteCode.",
    inputSchema: {
      type: "object",
      properties: {
        inviteCode: { type: "string" },
      },
      required: ["inviteCode"],
    },
  },
  {
    name: "list_public_invites",
    description:
      "List reusable public connection links owned by the authenticated human.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "create_public_invite",
    description:
      "Create a reusable public link and QR target. Each redemption creates a request that the human owner must approve.",
    inputSchema: {
      type: "object",
      properties: {
        label: { type: "string", description: "Optional label for the link" },
        maxRedemptions: {
          type: "number",
          description: "Maximum requests, from 1 to 100 (default 25)",
        },
        expiresInHours: {
          type: "number",
          description: "Expiry from 1 to 720 hours (default 720)",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "redeem_public_invite",
    description:
      "Redeem a public invite URL token for the authenticated human. This sends an approval-gated connection request.",
    inputSchema: {
      type: "object",
      properties: {
        token: {
          type: "string",
          description: "The pi_ token from the /join/ URL",
        },
      },
      required: ["token"],
      additionalProperties: false,
    },
  },
  {
    name: "revoke_public_invite",
    description: "Revoke one of the human's reusable public invitation links.",
    inputSchema: {
      type: "object",
      properties: { publicInviteId: { type: "string" } },
      required: ["publicInviteId"],
      additionalProperties: false,
    },
  },
  {
    name: "list_sessions",
    description: "List coordination sessions the authenticated user participates in.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "post_board_message",
    description:
      "Post a message to a session board (e.g. avail.offer, proposal, note).",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        kind: {
          type: "string",
          description: "Message kind, e.g. avail.offer, note, proposal",
        },
        body: {
          type: "object",
          description: "JSON payload for the board message",
          additionalProperties: true,
        },
      },
      required: ["sessionId", "kind"],
    },
  },
  {
    name: "read_board",
    description: "Read a session and its board messages.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
      },
      required: ["sessionId"],
    },
  },
  {
    name: "list_intents",
    description: "List live intents available for agent discovery.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Optional search query" },
      },
    },
  },
  {
    name: "propose_intent",
    description: "Propose a new intent type for the registry (deduped).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        slug: { type: "string" },
        description: { type: "string" },
        force: {
          type: "boolean",
          description: "Force create despite similar matches",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "request_schedule_meeting",
    description: SCHEDULE_MEETING_TOOL_DESCRIPTION,
    inputSchema: {
      type: "object",
      properties: {
        peerEmail: { type: "string" },
        peerEmails: {
          type: "array",
          items: { type: "string" },
          description: "Group coordination — 2+ peer emails (organizer implied)",
        },
        linkId: { type: "string" },
        durationMinutes: { type: "number" },
        windowStart: { type: "string", description: "ISO datetime" },
        windowEnd: { type: "string", description: "ISO datetime" },
        timezone: { type: "string" },
        title: { type: "string" },
        notes: { type: "string" },
        idempotencyKey: {
          type: "string",
          description: "Stable unique key for safe retries",
        },
      },
    },
  },
  {
    name: "list_confirms",
    description:
      "List decisions waiting for the human. The human responds at /app/attention.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "list_guest_tasks",
    description:
      "List private, invitation-scoped guest requests created by this user.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "create_guest_task",
    description:
      "Create a targeted, expiring request for one no-account guest. The returned private URL grants access only to this task.",
    inputSchema: {
      type: "object",
      properties: {
        taskType: {
          type: "string",
          enum: [
            "binary_choice",
            "text_response",
            "availability",
            "hiring_compatibility",
          ],
        },
        title: { type: "string" },
        description: { type: "string" },
        targetEmail: { type: "string" },
        config: { type: "object", additionalProperties: true },
        privateConfig: {
          type: "object",
          description:
            "Organizer-only constraints. Required for hiring_compatibility and never returned to the guest.",
          additionalProperties: true,
        },
        expiresInMinutes: { type: "number" },
        maxResponses: { type: "number" },
        sessionId: { type: "string" },
      },
      required: ["taskType", "title", "targetEmail"],
    },
  },
  {
    name: "read_guest_task",
    description: "Read one guest request and its responses.",
    inputSchema: {
      type: "object",
      properties: { publicId: { type: "string" } },
      required: ["publicId"],
    },
  },
  {
    name: "revoke_guest_task",
    description: "Revoke an open guest request immediately.",
    inputSchema: {
      type: "object",
      properties: { publicId: { type: "string" } },
      required: ["publicId"],
    },
  },
];

function baseUrlFromRequest(request?: Request): string | undefined {
  if (!request) return undefined;
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}

export async function dispatchMcpTool(
  auth: AgentAuth,
  name: string,
  args: Record<string, unknown> = {},
  request?: Request,
): Promise<unknown> {
  const baseUrl = baseUrlFromRequest(request);

  switch (name) {
    case "whoami":
    case "health":
      return whoami(auth);
    case "get_inbox":
    case "list_inbox":
      return listInbox(auth);
    case "ack_inbox":
      return ackInbox(auth, String(args.inboxId ?? ""));
    case "register_agent_callback":
      return setAgentCallback(
        auth,
        typeof args.callbackUrl === "string" ? args.callbackUrl : null,
      );
    case "list_links":
      return listLinks(auth, baseUrl);
    case "create_invite":
      return createInvite(
        auth,
        {
          toEmail: args.toEmail as string | undefined,
          toName: args.toName as string | undefined,
          scopes: args.scopes as string[] | undefined,
          confirmRequired: args.confirmRequired as boolean | undefined,
          timezone: args.timezone as string | undefined,
          allowedHours: args.allowedHours as
            | { start: string; end: string; days?: number[] }
            | undefined,
        },
        baseUrl,
      );
    case "accept_invite":
      return acceptInvite(
        auth,
        { inviteCode: args.inviteCode as string | undefined },
        baseUrl,
      );
    case "list_public_invites":
      return listPublicInvites(auth, baseUrl);
    case "create_public_invite":
      return createPublicInvite(
        auth,
        {
          label: args.label,
          maxRedemptions: args.maxRedemptions,
          expiresInHours: args.expiresInHours,
        },
        baseUrl,
      );
    case "redeem_public_invite":
      return redeemPublicInvite(auth, {
        token: args.token as string | undefined,
      });
    case "revoke_public_invite":
      return revokePublicInvite(auth, String(args.publicInviteId ?? ""));
    case "list_sessions":
      return listSessions(auth);
    case "post_board_message":
      return postBoardMessage(auth, String(args.sessionId ?? ""), {
        kind: args.kind as string | undefined,
        body: (args.body as Record<string, unknown> | undefined) ?? {},
      });
    case "read_board":
      return readBoard(auth, String(args.sessionId ?? ""));
    case "list_intents":
      assertAgentScope(auth, "intents:read");
      return listIntents(args.q as string | undefined);
    case "propose_intent":
      return proposeIntent(auth, {
        name: args.name as string | undefined,
        slug: args.slug as string | undefined,
        description: args.description as string | undefined,
        force: Boolean(args.force),
      });
    case "request_schedule_meeting":
      return requestScheduleMeeting(auth, {
        peerEmail: args.peerEmail as string | undefined,
        peerEmails: args.peerEmails as string[] | undefined,
        linkId: args.linkId as string | undefined,
        durationMinutes: args.durationMinutes as number | undefined,
        windowStart: args.windowStart as string | undefined,
        windowEnd: args.windowEnd as string | undefined,
        timezone: args.timezone as string | undefined,
        title: args.title as string | undefined,
        notes: args.notes as string | undefined,
        idempotencyKey: args.idempotencyKey as string | undefined,
        origin: baseUrl,
      });
    case "list_confirms":
      return listConfirms(auth);
    case "list_guest_tasks":
      return listGuestTasks(auth);
    case "create_guest_task":
      return createGuestTask(
        auth,
        {
          taskType: args.taskType as string | undefined,
          title: args.title as string | undefined,
          description: args.description as string | undefined,
          targetEmail: args.targetEmail as string | undefined,
          config: args.config as Record<string, unknown> | undefined,
          privateConfig: args.privateConfig as
            | Record<string, unknown>
            | undefined,
          expiresInMinutes: args.expiresInMinutes as number | undefined,
          maxResponses: args.maxResponses as number | undefined,
          sessionId: args.sessionId as string | undefined,
        },
        baseUrl,
      );
    case "read_guest_task":
      return readGuestTask(auth, String(args.publicId ?? ""));
    case "revoke_guest_task":
      return revokeGuestTask(auth, String(args.publicId ?? ""));
    default:
      throw new AgentApiError(404, `Unknown tool: ${name}`);
  }
}

export function mcpToolResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
    structuredContent: data,
  };
}

export function mcpToolError(err: unknown) {
  if (err instanceof AgentApiError) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            { error: err.message, details: err.details, status: err.status },
            null,
            2,
          ),
        },
      ],
    };
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}
