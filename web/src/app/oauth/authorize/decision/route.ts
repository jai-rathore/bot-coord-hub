import {
  buildAuthorizeRedirect,
  createAuthorizationCode,
  loadOAuthClient,
  scopesFromAuthorizeRequest,
} from "@/lib/mcp-oauth";
import { AgentApiError } from "@/lib/agent-errors";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await ensureCurrentUser();
  if (!user) {
    return Response.json({ error: "Sign in to authorize this agent" }, {
      status: 401,
    });
  }

  try {
    const body = (await request.json()) as {
      decision?: "approved" | "denied";
      client_id?: string;
      redirect_uri?: string;
      state?: string | null;
      code_challenge?: string;
      scope?: string | null;
      agent_name?: string;
    };

    if (!body.client_id || !body.redirect_uri || !body.code_challenge) {
      return Response.json({ error: "Missing OAuth parameters" }, { status: 400 });
    }

    const client = await loadOAuthClient(body.client_id);
    if (!client) {
      return Response.json({ error: "Unknown OAuth client" }, { status: 400 });
    }
    if (!client.redirectUris.includes(body.redirect_uri)) {
      return Response.json({ error: "redirect_uri mismatch" }, { status: 400 });
    }

    if (body.decision === "denied") {
      return Response.json({
        ok: true,
        redirectTo: buildAuthorizeRedirect(body.redirect_uri, {
          error: "access_denied",
          error_description: "The human declined this connection",
          state: body.state,
        }),
      });
    }

    if (body.decision !== "approved") {
      return Response.json({ error: "decision must be approved or denied" }, {
        status: 400,
      });
    }

    const scopes = scopesFromAuthorizeRequest(body.scope ?? null);
    const code = await createAuthorizationCode({
      user,
      clientId: body.client_id,
      redirectUri: body.redirect_uri,
      codeChallenge: body.code_challenge,
      scopes,
      agentName:
        body.agent_name?.trim() ||
        client.clientName ||
        "MCP Agent",
    });

    return Response.json({
      ok: true,
      redirectTo: buildAuthorizeRedirect(body.redirect_uri, {
        code,
        state: body.state,
      }),
    });
  } catch (error) {
    if (error instanceof AgentApiError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("[oauth] authorize decision failed", error);
    return Response.json({ error: "Could not complete authorization" }, {
      status: 500,
    });
  }
}
