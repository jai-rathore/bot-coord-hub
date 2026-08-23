import { writeAudit } from "@/lib/audit";
import { disconnectGoogle } from "@/lib/google-oauth";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

/** POST /api/google/disconnect: remove Google Calendar connection. */
export async function POST() {
  const user = await ensureCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ok = await disconnectGoogle(user.id);
  if (ok) {
    await writeAudit({
      actorUserId: user.id,
      action: "calendar.disconnect",
      entityType: "calendar_connection",
      entityId: user.id,
      metadata: { provider: "google" },
    });
  }
  return Response.json({ ok: true, disconnected: ok });
}
