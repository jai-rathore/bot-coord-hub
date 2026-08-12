import { decideAgentPairing } from "@/lib/agent-pairing";
import {
  jsonFromAgentError,
  jsonOk,
  readJsonBody,
} from "@/lib/http";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ userCode: string }> };

export async function POST(request: Request, context: Context) {
  const user = await ensureCurrentUser();
  if (!user) {
    return Response.json({ error: "Sign in to decide this connection" }, {
      status: 401,
    });
  }
  try {
    const { userCode } = await context.params;
    const body = await readJsonBody<{ decision?: "approved" | "denied" }>(
      request,
    );
    if (body.decision !== "approved" && body.decision !== "denied") {
      return Response.json({ error: "decision must be approved or denied" }, {
        status: 400,
      });
    }
    return jsonOk({
      ok: true,
      pairing: await decideAgentPairing({
        user,
        userCode,
        decision: body.decision,
      }),
    });
  } catch (error) {
    return jsonFromAgentError(error);
  }
}
