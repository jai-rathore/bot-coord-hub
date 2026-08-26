import { reviseHiringGuestTask } from "@/lib/guest-tasks";
import { jsonError, readJsonBody } from "@/lib/http";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ publicId: string }> };

export async function POST(request: Request, context: Context) {
  const user = await ensureCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { publicId } = await context.params;
    const body = await readJsonBody<{
      privateConfig?: Record<string, unknown>;
      candidateFacingUpdate?: string;
    }>(request);
    return Response.json({
      ok: true,
      ...(await reviseHiringGuestTask({
        organizer: user,
        publicId,
        privateConfig: body.privateConfig,
        candidateFacingUpdate: body.candidateFacingUpdate,
      })),
    });
  } catch (error) {
    return jsonError(error, "Could not revise the role terms");
  }
}
