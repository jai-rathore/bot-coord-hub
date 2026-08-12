import { ensureCurrentUser } from "@/lib/users";
import { decideConfirm } from "@/lib/confirms";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Human decide confirm.
 * PATCH /api/confirms/:id — { decision: "approved" | "denied", note? }
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await ensureCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  let body: { decision?: string; note?: string } = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.decision !== "approved" && body.decision !== "denied") {
    return Response.json(
      { error: 'decision must be "approved" or "denied"' },
      { status: 400 },
    );
  }

  try {
    const confirm = await decideConfirm({
      user,
      confirmId: id,
      decision: body.decision,
      note: body.note,
    });
    return Response.json({ ok: true, confirm });
  } catch (err) {
    return jsonError(err, "Failed to update confirm");
  }
}
