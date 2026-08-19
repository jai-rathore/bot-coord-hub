import { jsonError, readJsonBody } from "@/lib/http";
import { ensureCurrentUser, updateNotificationPrefs } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await ensureCurrentUser();
  if (!user) {
    return Response.json({ error: "Sign in to update notifications." }, { status: 401 });
  }
  try {
    const body = await readJsonBody<{
      channel?: unknown;
      phone?: unknown;
    }>(request);
    const updated = await updateNotificationPrefs(user, body);
    return Response.json({
      ok: true,
      notifyChannel: updated.notifyChannel,
      hasPhone: Boolean(updated.phoneE164),
      phone: updated.phoneE164,
    });
  } catch (error) {
    return jsonError(error, "Could not save notification preferences");
  }
}
