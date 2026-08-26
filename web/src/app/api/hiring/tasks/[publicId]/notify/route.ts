import { notifyHiringCandidateAgent } from "@/lib/guest-tasks";
import { jsonError } from "@/lib/http";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ publicId: string }> };

export async function POST(_request: Request, context: Context) {
  const user = await ensureCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { publicId } = await context.params;
    return Response.json({
      ok: true,
      ...(await notifyHiringCandidateAgent({ organizer: user, publicId })),
    });
  } catch (error) {
    return jsonError(error, "Could not notify the candidate's agent");
  }
}
