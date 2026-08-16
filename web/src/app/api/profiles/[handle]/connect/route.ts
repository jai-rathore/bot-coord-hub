import { requestProfileConnection } from "@/lib/agent-profiles";
import { jsonError } from "@/lib/http";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ handle: string }> },
) {
  const user = await ensureCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { handle } = await context.params;
  try {
    return Response.json(await requestProfileConnection({ user, handle }), {
      status: 201,
    });
  } catch (error) {
    return jsonError(error, "Failed to request connection");
  }
}
