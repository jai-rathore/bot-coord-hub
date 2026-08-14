import { ensureCurrentUser } from "@/lib/users";
import { isIntentAdmin } from "@/lib/intent-moderation";
import { setDiscoverySafetyStatus } from "@/lib/discovery-service";
import { errorMessage, errorStatus } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const moderator = await ensureCurrentUser();
  if (!moderator) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isIntentAdmin(moderator)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const body = (await request.json()) as {
      subjectUserId?: unknown;
      status?: unknown;
      reasonCode?: unknown;
    };
    if (
      typeof body.subjectUserId !== "string" ||
      !["active", "restricted", "suspended"].includes(String(body.status))
    ) {
      return Response.json(
        { error: "subjectUserId and a valid status are required" },
        { status: 400 },
      );
    }
    return Response.json({
      safety: await setDiscoverySafetyStatus({
        moderator,
        subjectUserId: body.subjectUserId,
        status: body.status as "active" | "restricted" | "suspended",
        reasonCode:
          typeof body.reasonCode === "string" ? body.reasonCode : undefined,
      }),
    });
  } catch (error) {
    return Response.json(
      { error: errorMessage(error) },
      { status: errorStatus(error) },
    );
  }
}
