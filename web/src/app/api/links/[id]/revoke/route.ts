import { ensureCurrentUser } from "@/lib/users";
import { revokeLinkForUser } from "@/lib/links";
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
    const result = await revokeLinkForUser({ user, linkId: id });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return jsonError(err, "Failed to revoke link");
  }
}
