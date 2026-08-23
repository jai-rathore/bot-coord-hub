import { ensureCurrentUser } from "@/lib/users";
import { jsonError } from "@/lib/http";
import {
  getAgentOperatorMode,
  setAgentOperatorMode,
  type AgentOperatorMode,
} from "@/lib/sage/job-store";

export const dynamic = "force-dynamic";

const MODES: AgentOperatorMode[] = [
  "sage_primary",
  "external_primary",
  "sage_only",
];

export async function GET() {
  const user = await ensureCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json({ mode: await getAgentOperatorMode(user.id) });
  } catch (error) {
    return jsonError(error, "Failed to load operator preference");
  }
}

export async function PATCH(request: Request) {
  const user = await ensureCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await request.json()) as { mode?: unknown };
    if (!MODES.includes(body.mode as AgentOperatorMode)) {
      return Response.json({ error: "Invalid operator mode" }, { status: 400 });
    }
    const preference = await setAgentOperatorMode(
      user.id,
      body.mode as AgentOperatorMode,
    );
    return Response.json({ mode: preference.mode });
  } catch (error) {
    return jsonError(error, "Failed to update operator preference");
  }
}
