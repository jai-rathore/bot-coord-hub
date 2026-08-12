import { ensureCurrentUser } from "@/lib/users";
import { acceptInviteLink } from "@/lib/links";
import { requestOrigin } from "@/lib/invite";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await ensureCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { inviteCode?: string } = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.inviteCode?.trim()) {
    return Response.json({ error: "inviteCode is required" }, { status: 400 });
  }

  try {
    const result = await acceptInviteLink({
      user,
      inviteCode: body.inviteCode,
      origin: requestOrigin(request),
    });
    return Response.json({
      ok: true,
      link: result.link,
      pair: result.pair,
    });
  } catch (err) {
    return jsonError(err, "Failed to accept invite");
  }
}
