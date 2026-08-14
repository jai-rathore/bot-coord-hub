import { ensureCurrentUser } from "@/lib/users";
import { revokePublicInvite } from "@/lib/public-invites";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await ensureCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  try {
    return Response.json({
      ok: true,
      ...(await revokePublicInvite({ owner: user, publicInviteId: id })),
    });
  } catch (error) {
    return jsonError(error, "Failed to revoke public invite");
  }
}
