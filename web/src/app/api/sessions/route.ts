import { ensureCurrentUser } from "@/lib/users";
import { listSessionsForUser } from "@/lib/sessions";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await ensureCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sessions = await listSessionsForUser(user);
    return Response.json({ sessions });
  } catch (err) {
    return jsonError(err, "Failed to list sessions");
  }
}
