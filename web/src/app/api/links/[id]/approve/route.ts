import { ensureCurrentUser } from "@/lib/users";
import { approveConnectionRequest } from "@/lib/links";
import { jsonError, requestOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await ensureCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  try {
    const result = await approveConnectionRequest({
      user,
      linkId: id,
      origin: requestOrigin(request),
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return jsonError(error, "Failed to approve connection request");
  }
}
