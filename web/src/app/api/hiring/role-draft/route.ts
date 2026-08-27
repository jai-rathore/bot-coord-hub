import { draftHiringRoleForUser } from "@/lib/hiring-role-draft";
import { jsonFromAgentError, readJsonBody } from "@/lib/http";
import { boundedText } from "@/lib/validation";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await ensureCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await readJsonBody(request);
    return Response.json(
      await draftHiringRoleForUser({
        userId: user.id,
        sourceUrl: boundedText(body.sourceUrl, "sourceUrl", 2_048),
        description: boundedText(body.description, "description", 16_000),
        signal: request.signal,
      }),
    );
  } catch (error) {
    return jsonFromAgentError(error);
  }
}
